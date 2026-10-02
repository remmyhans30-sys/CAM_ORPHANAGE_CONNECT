// Runs one SQL statement on the test database and returns the result as text: one row per line,
// a tab between columns (like `mysql -N -B`), or "ERROR <message>" when MySQL refuses it.
// It is synchronous, so a test can use it inside a check(...): a tiny child process runs the query
// with the server's own MySQL library, so the mysql program does not need to be installed.
const path = require('path');
const { execFileSync } = require('child_process');
const { dbSettings } = require('./site');

function sql(query) {
  const s = dbSettings();
  try {
    return execFileSync(process.execPath, [path.join(__dirname, 'sql-child.js'), query], {
      env: Object.assign({}, process.env, { Q_HOST: s.host, Q_PORT: String(s.port), Q_USER: s.user, Q_PASSWORD: s.password, Q_DATABASE: s.database }),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
  } catch (err) {
    return 'ERROR ' + (err.stderr ? err.stderr.toString().trim() : err.message);
  }
}

module.exports = { sql };
