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
    const bout = JSON.parse(event.body); // Assuming event.body contains the bout details as JSON

    try {
        const sqlStmt = `INSERT INTO bout (challenger_id, acceptor_id, referee_id, style_id, accepted, completed, cancelled) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING bout_id`;
        const { rows } = await pool.query(sqlStmt, [bout.challengerId, bout.acceptorId, bout.refereeId, bout.styleId, bout.accepted, bout.completed, bout.cancelled]);
        const boutId = rows[0].bout_id; // Extracting the returned bout_id

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ boutId: boutId, message: "Bout successfully created" }),
        };
    } catch (err) {
        console.error('Error creating bout:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create bout' }),
        };
    }
};
