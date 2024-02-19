const { Pool } = require('pg');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

// Function to retrieve database configuration from SSM Parameter Store
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

  return {
    user: config.DB_USER,
    host: config.DB_HOST,
    database: config.DB_NAME,
    password: config.DB_PASS,
    port: config.DB_PORT,
  };
}

const poolPromise = getDbConfig().then(config => new Pool(config));

exports.handler = async (event) => {
  const pool = await poolPromise;
  const { username, password } = event //JSON.parse(event.body); when through api gateway
  try {
    const query = 'SELECT * FROM athlete WHERE username = $1 AND password = $2';
    const res = await pool.query(query, [username, password]);
    if (res.rows.length === 0) {
      // No matching user found
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid username or password." })
      };
    } else {
      // User found, return the athlete ID
      const athlete = res.rows[0];
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete })
      };
    }
  } catch (err) {
    console.error('Error querying athletes:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to authenticate athlete' }),
    };
  }
};