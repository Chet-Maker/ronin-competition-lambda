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
    // Extract boutId and athleteId (challengerId) from the path parameters
    const { boutId, athleteId } = event.pathParameters;

    try {
        const sqlStmt = `UPDATE bout SET accepted = true WHERE bout_id = $1`;
        await pool.query(sqlStmt, [boutId]);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Bout successfully accepted" }),
        };
    } catch (err) {
        console.error('Error accepting bout:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to accept bout' }),
        };
    }
};
