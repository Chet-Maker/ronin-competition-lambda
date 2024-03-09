const { Pool } = require('pg');
const AWS = require('aws-sdk');

// Initialize AWS SDK for Systems Manager to fetch database configuration
const ssm = new AWS.SSM();

async function getDbConfig() {
    const params = {
        Names: [
            '/roninCompetition/DB_USER',
            '/roninCompetition/DB_HOST',
            '/roninCompetition/DB_NAME',
            '/roninCompetition/DB_PASS',
            '/roninCompetition/DB_PORT',
        ],
        WithDecryption: true,
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
        port: config.DB_PORT,
    });
}

const poolPromise = getDbConfig();

exports.handler = async (event) => {
    const pool = await poolPromise;

    try {
        const sqlStmt = `SELECT outcome_id, bout_id, winner_id, loser_id, is_draw, created_dt, updated_dt FROM outcome`;
        const { rows } = await pool.query(sqlStmt);
        
        // Optionally, transform row data as needed before sending response
        const bouts = rows.map(row => ({
            outcomeId: row.outcome_id,
            boutId: row.bout_id,
            winnerId: row.winner_id,
            loserId: row.loser_id,
            is_draw: row.is_draw,
            createdDate: row.created_dt,
            updatedDate: row.updated_dt,
        }));

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bouts),
        };
    } catch (err) {
        console.error('Error fetching outcomes:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to get outcomes' }),
        };
    }
};
