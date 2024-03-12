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

  try {
    const {rows} = await pool.query('SELECT style_id, style_name FROM style');

    const styles = rows.map(row => ({
      styleId: row.style_id,
      styleName: row.style_name,
    }));

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json", 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
      body: JSON.stringify(styles), // Return the array of usernames
    };
  } catch (err) {
    console.error('Error querying athlete usernames:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve usernames' }),
    };
  }
};