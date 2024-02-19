const { Pool } = require('pg');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

// Asynchronously fetch database configuration from SSM and initialize the pool
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
    port: config.DB_PORT,
  });
}

const poolPromise = getDbConfig();

exports.handler = async (event) => {
  const { athlete_id, challenger_id } = event.pathParameters;
  
  const pool = await poolPromise;

  try {
    const query = `
      SELECT s.style_id, s.style_name
      FROM style AS s
      JOIN athlete_style AS as1 ON s.style_id = as1.style_id
      JOIN athlete_style AS as2 ON s.style_id = as2.style_id
      WHERE as1.athlete_id=$1 and as2.athlete_id=$2
    `;

    const result = await pool.query(query, [athlete_id, challenger_id]);
    const styles = result.rows;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(styles),
    };
  } catch (err) {
    console.error('Error querying common styles:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve common styles' }),
    };
  }
};
