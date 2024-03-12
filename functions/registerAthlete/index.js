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
    const { firstName, lastName, username, birthDate, email, password, styles } = JSON.parse(event.body);

    try {
        // Insert into athlete table and get athlete_id
        const athleteInsertSql = `INSERT INTO athlete (first_name, last_name, username, birth_date, email, password)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING athlete_id`;
        const athleteRes = await pool.query(athleteInsertSql, [firstName, lastName, username, birthDate, email, password]);
        const athleteId = athleteRes.rows[0].athlete_id;
        
        const athleteRecordInsertSql = `INSERT INTO athlete_record (athlete_id, style_id, wins, losses, draws) VALUES ($1, $2, 0, 0, 0)`;
        const athleteScoreInsertSql = `INSERT INTO athlete_score (athlete_id, style_id, score) VALUES ($1, $2, 400)`;
        const athleteStyleInsertSql = `INSERT INTO athlete_style (athlete_id, style_id) VALUES ($1, $2)`;
        for (const style of styles) {
            await pool.query(athleteRecordInsertSql, [athleteId, style.styleId]);
            await pool.query(athleteScoreInsertSql, [athleteId, style.styleId]);
            await pool.query(athleteStyleInsertSql, [athleteId, style.styleId]);
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "POST,OPTIONS"},
            body: JSON.stringify({ athleteId: athleteId, message: "Athlete successfully registered with styles" }),
        };
    } catch (err) {
        console.error('Error registering athlete:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to register athlete' }),
        };
    }
};
