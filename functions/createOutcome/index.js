const { Pool } = require('pg');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

async function getDbConfig() {
    const params = {
        Names: [
            '/roninCompetition/DB_USER',
            '/roninCompetition/DB_HOST',
            '/roninCompetition/DB_NAME',
            '/roninCompetition/DB_PASS',
            '/roninCompetition/DB_PORT'
        ],
        WithDecryption: true
    };

    const response = await ssm.getParameters(params).promise();
    const config = response.Parameters.reduce((acc, param) => {
        acc[param.Name.split('/').pop()] = param.Value;
        return acc;
    }, {});

    return new Pool({
        user: config.DB_USER,
        host: config.DB_HOST,
        database: config.DB_NAME,
        password: config.DB_PASS,
        port: config.DB_PORT
    });
}

const poolPromise = getDbConfig();

// Helper function to calculate new scores
function calculateScore(winnerScore, loserScore, isDraw) {
    const expectedOutcomeWinner = 1 / (1 + Math.pow(10, (loserScore - winnerScore) / 400));
    const expectedOutcomeLoser = 1 - expectedOutcomeWinner;

    const actualOutcomeWinner = isDraw ? 0.5 : 1;
    const actualOutcomeLoser = isDraw ? 0.5 : 0;

    const updatedWinnerScore = winnerScore + 32 * (actualOutcomeWinner - expectedOutcomeWinner);
    const updatedLoserScore = loserScore + 32 * (actualOutcomeLoser - expectedOutcomeLoser);

    return {
        updatedWinnerScore: Math.round(updatedWinnerScore),
        updatedLoserScore: Math.round(updatedLoserScore)
    };
}

exports.handler = async (event) => {
    const pool = await poolPromise;
    const { bout_id } = event.pathParameters;
    const { winnerId, loserId, styleId, isDraw } = JSON.parse(event.body);
    let outcomeId = null;

    try {
        await pool.query('BEGIN');
        const insertOutcomeSql = `
            INSERT INTO outcome (bout_id, winner_id, loser_id, is_draw, style_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING outcome_id
        `;
        if (isDraw) {
            const outcomeResult = await pool.query(insertOutcomeSql, [bout_id, null, null, true, styleId]);
            outcomeId = outcomeResult.rows[0].outcome_id;
            // Update records for both athletes
            const updateRecordForDraw = `UPDATE athlete_record SET draws = draws + 1 WHERE athlete_id = $1`;
            await pool.query(updateRecordForDraw, [winnerId]);
            await pool.query(updateRecordForDraw, [loserId]);
        } else {
            const outcomeResult = await pool.query(insertOutcomeSql, [bout_id, winnerId, loserId, isDraw, styleId]);
            outcomeId = outcomeResult.rows[0].outcome_id;
            // Update records for winner and loser
            const updateRecordsForWinnerSql = `UPDATE athlete_record SET wins = wins + 1 WHERE athlete_id = $1`;
            const updateRecordsForLoserSql = `UPDATE athlete_record SET losses = losses + 1 WHERE athlete_id = $1`;
            await pool.query(updateRecordsForWinnerSql, [winnerId]);
            await pool.query(updateRecordsForLoserSql, [loserId]);
            // Get the latest score for each athlete in the style
            const getScoreSql = `SELECT score FROM athlete_score WHERE athlete_id = $1 AND style_id = $2 ORDER BY updated_dt DESC LIMIT 1`;
            const winnerScoreResult = await pool.query(getScoreSql, [winnerId, styleId]);
            const loserScoreResult = await pool.query(getScoreSql, [loserId, styleId]);
            // Default to 400 if no score found
            const winnerScore = winnerScoreResult.rows[0] ? winnerScoreResult.rows[0].score : 400; // Default to 0 if no score found
            const loserScore = loserScoreResult.rows[0] ? loserScoreResult.rows[0].score : 400; // Default to 0 if no score found
            const { updatedWinnerScore, updatedLoserScore } = calculateScore(winnerScore, loserScore, isDraw);
            // Update scores for winner and loser
            const updateScoreSql = `INSERT INTO athlete_score (athlete_id, style_id, score, outcome_id, created_dt, updated_dt) VALUES ($1, $2, $3, $4, NOW(), NOW())`;
            await pool.query(updateScoreSql, [winnerId, styleId, updatedWinnerScore, outcomeId]);
            await pool.query(updateScoreSql, [loserId, styleId, updatedLoserScore, outcomeId]);
        }

        // Mark the bout as completed
        const updateBoutSql = `UPDATE bout SET completed = true WHERE bout_id = $1`;
        await pool.query(updateBoutSql, [bout_id]);

        await pool.query('COMMIT');

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Bout completed and scores updated successfully", outcomeId }),
        };
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Transaction failed:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to complete bout and update scores' }),
        }
    }
}
