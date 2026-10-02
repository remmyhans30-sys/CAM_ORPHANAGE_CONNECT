// Used by db.js: runs the SQL statement given as the first argument and prints the rows.
const path = require('path');
const mysql = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'mysql2', 'promise'));

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.Q_HOST, port: Number(process.env.Q_PORT), user: process.env.Q_USER,
    password: process.env.Q_PASSWORD, database: process.env.Q_DATABASE, dateStrings: true, timezone: 'Z',
  });
  try {
    const [rows] = await conn.query(process.argv[2]);
    if (Array.isArray(rows)) {
      process.stdout.write(rows.map((row) => Object.values(row).map((v) => (v === null ? 'NULL' : String(v))).join('\t')).join('\n'));
    }
  } catch (err) {
    process.stderr.write(err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
