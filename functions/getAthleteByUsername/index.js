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
        const sqlStmt = `SELECT athlete_id, first_name, last_name, username, birth_date, email, created_dt, updated_dt FROM athlete WHERE username = $1`;
        const { rows } = await pool.query(sqlStmt, [event.pathParameters.username]);
        
        // Optionally, transform row data as needed before sending response
        const athletes = rows.map(row => ({
            athleteId: row.athlete_id,
            firstName: row.first_name,
            lastName: row.last_name,
            username: row.username,
            birthDate: row.birth_date,
            email: row.email,
            // password field is intentionally omitted for security reasons
            createdDate: row.created_dt,
            updatedDate: row.updated_dt,
        }));

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(athletes),
        };
    } catch (err) {
        console.error('Error fetching athletes:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to get athletes' }),
        };
    }
};
