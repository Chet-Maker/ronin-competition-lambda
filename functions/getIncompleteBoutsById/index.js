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
    const { athlete_id } = event.pathParameters;
    const pool = await poolPromise;

    try {
        const query = `
        WITH latest_scores AS (
            SELECT 
                athlete_id, 
                style_id, 
                score, 
                updated_dt,
                ROW_NUMBER() OVER (PARTITION BY athlete_id, style_id ORDER BY updated_dt DESC) as row_num
            FROM athlete_score
        )
        SELECT 
            b.bout_id AS "boutId",
            b.challenger_id AS "challengerId",
            c.first_name AS "challengerFirstName",
            c.last_name AS "challengerLastName",
            s.style_name AS "style",
            s.style_id AS "styleId",
            cs.score AS "challengerScore",
            b.acceptor_id AS "acceptorId",
            a.first_name AS "acceptorFirstName",
            a.last_name AS "acceptorLastName",
            ascore.score AS "acceptorScore",
            r.athlete_id AS "refereeId",
            r.first_name AS "refereeFirstName",
            r.last_name AS "refereeLastName"
        FROM 
            bout b
        JOIN 
            athlete c ON b.challenger_id = c.athlete_id
        JOIN 
            athlete a ON b.acceptor_id = a.athlete_id
        JOIN 
            latest_scores cs ON b.challenger_id = cs.athlete_id AND b.style_id = cs.style_id AND cs.row_num = 1
        JOIN 
            latest_scores ascore ON b.acceptor_id = ascore.athlete_id AND b.style_id = ascore.style_id AND ascore.row_num = 1
        JOIN 
            athlete r ON b.referee_id = r.athlete_id
        JOIN 
            style s ON b.style_id = s.style_id
        WHERE 
            b.accepted = true AND b.cancelled = false AND b.completed = false AND (b.challenger_id = $1 OR b.acceptor_id = $1 OR b.referee_id = $1)
        `;

        const result = await pool.query(query, [athlete_id]);
        const bouts = result.rows;

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bouts),
        };
    } catch (err) {
        console.error('Error querying incomplete bouts:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to retrieve incomplete bouts' }),
        };
    }
};
