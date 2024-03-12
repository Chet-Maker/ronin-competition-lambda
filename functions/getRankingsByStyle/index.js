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
        // Your SQL statement should join the athlete, athlete_record, and style tables to retrieve rankings
        const sqlStatement = `
        SELECT s.style_name, s.style_id, a.athlete_id, a.first_name, a.last_name, a.username, 
               ar.wins, ar.losses, ascore.score
        FROM athlete a
        JOIN athlete_record ar ON a.athlete_id = ar.athlete_id
        JOIN athlete_score ascore ON a.athlete_id = ascore.athlete_id AND ar.style_id = ascore.style_id
        JOIN style s ON ascore.style_id = s.style_id
        WHERE ascore.updated_dt IN (
            SELECT MAX(ascore.updated_dt)
            FROM athlete_score ascore
            WHERE ascore.athlete_id = a.athlete_id AND ascore.style_id = s.style_id
            GROUP BY ascore.style_id
        )
        AND ar.updated_dt IN (
            SELECT MAX(ar.updated_dt)
            FROM athlete_record ar
            WHERE ar.athlete_id = a.athlete_id AND ar.style_id = s.style_id
            GROUP BY ar.style_id
        )
        ORDER BY s.style_id, ascore.score DESC;
        `;

        const { rows } = await pool.query(sqlStatement);

        // Assuming you want to structure your JSON output as described
        const output = rows.reduce((acc, row) => {
            if (!acc[row.style_name]) {
                acc[row.style_name] = {
                    style: row.style_name,
                    styleId: row.style_id,
                    ranking: [],
                };
            }
            acc[row.style_name].ranking.push({
                athlete_id: row.athlete_id,
                firstName: row.first_name,
                lastName: row.last_name,
                username: row.username,
                wins: row.wins,
                losses: row.losses,
                score: row.score,
            });
            return acc;
        }, {});

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
            },
            body: JSON.stringify(Object.values(output)),
        };
    } catch (err) {
        console.error('Error fetching athlete rankings:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch athlete rankings' }),
        };
    }
};
