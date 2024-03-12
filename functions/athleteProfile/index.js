const { Pool } = require('pg');
const AWS = require('aws-sdk');

// Initialize AWS SDK for Systems Manager
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
    const athleteId = event.pathParameters.athleteId;

    try {
        // Query to fetch athlete info
        const athleteQuery = `SELECT athlete_id, first_name, last_name, username, birth_date, email, created_dt, updated_dt FROM athlete WHERE athlete_id = $1`;
        const athleteInfo = await pool.query(athleteQuery, [athleteId]);

        // Query to fetch athlete records with style names
        const recordQuery = `
            SELECT ar.*, s.style_name 
            FROM athlete_record ar
            JOIN style s ON ar.style_id = s.style_id
            WHERE ar.athlete_id = $1`;
        const athleteRecords = await pool.query(recordQuery, [athleteId]);

        // Query to fetch athlete scores with style names
        const scoreQuery = `
            SELECT ascore.*, s.style_name 
            FROM athlete_score ascore
            JOIN style s ON ascore.style_id = s.style_id
            WHERE ascore.athlete_id = $1`;
        const athleteScores = await pool.query(scoreQuery, [athleteId]);

        // Combine the results into a single object
        const profile = {
            athleteInfo: athleteInfo.rows[0], // assuming one row per athlete
            athleteRecords: athleteRecords.rows,
            athleteScores: athleteScores.rows
        };

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json","Access-Control-Allow-Origin": "*", 
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,OPTIONS" },
            body: JSON.stringify(profile),
        };
    } catch (err) {
        console.error('Error fetching athlete profile:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch athlete profile' }),
        };
    }
};
