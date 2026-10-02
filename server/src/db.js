const { AsyncLocalStorage } = require('node:async_hooks');
const mysql = require('mysql2/promise');

// The MySQL connection. Settings come from server/.env (see .env.example).
const DB_NAME = process.env.DB_NAME || 'cam_orphanage_connect';

const connectionSettings = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  // Times are stored in UTC and handed to the pages as plain strings.
  timezone: 'Z',
  dateStrings: true,
  decimalNumbers: true,
  supportBigNumbers: false,
};

let pool = null;
const transaction = new AsyncLocalStorage();

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...connectionSettings, database: DB_NAME, connectionLimit: 10, waitForConnections: true });
  }
  return pool;
}

function executor() {
  const store = transaction.getStore();
  return store ? store.conn : getPool();
}

function clean(params) {
  return (params || []).map((p) => (p === undefined ? null : p));
}

// Rows of a SELECT.
async function q(sql, params) {
  const [rows] = await executor().query(sql, clean(params));
  return rows;
}

// First row of a SELECT, or null.
async function one(sql, params) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// INSERT / UPDATE / DELETE: returns { insertId, affectedRows }.
async function run(sql, params) {
  const [result] = await executor().query(sql, clean(params));
  return result;
}

// Everything inside fn happens together or not at all.
async function tx(fn) {
  if (transaction.getStore()) return fn();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await transaction.run({ conn }, fn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// --- times -------------------------------------------------------------------

// A JavaScript date (or ISO text) as MySQL DATETIME text, in UTC.
function sqlTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return sqlTime();
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// MySQL DATETIME text as an ISO time string for the pages.
function isoTime(value) {
  if (!value) return null;
  return String(value).replace(' ', 'T') + (String(value).length <= 19 ? 'Z' : '');
}

// The date part (YYYY-MM-DD) of a DATETIME or DATE value.
function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

// --- first-run setup -----------------------------------------------------------

// Runs database/cam_orphanage_connect.sql when the database is missing or empty.
// It never touches a database that already has tables.
async function createIfMissing() {
  const admin = await mysql.createConnection({ ...connectionSettings });
  try {
    const [found] = await admin.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [DB_NAME]);
    if (found[0].n > 0) return false;
    await admin.query('CREATE DATABASE IF NOT EXISTS `' + DB_NAME + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    await admin.query('USE `' + DB_NAME + '`');
    for (const statement of readScript()) {
      await admin.query(statement);
    }
    return true;
  } finally {
    await admin.end();
  }
}

// Creates the database when it is missing, then brings an older database up to date.
// Returns true when it created a fresh one.
async function ensureDatabase() {
  const created = await createIfMissing();
  await migrate(created);
  return created;
}

// Changes made to the database after its first version, applied once each, in order.
// A fresh database already includes them all, so they are only recorded as done.
async function migrate(fresh) {
  const fs = require('fs');
  const path = require('path');
  await run('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const dir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort() : [];
  for (const file of files) {
    const migration = require(path.join(dir, file));
    if (await one('SELECT name FROM schema_migrations WHERE name = ?', [migration.name])) continue;
    if (!fresh) {
      console.log('Updating the database: ' + migration.name);
      await migration.up({ q, one, run });
    }
    await run('INSERT INTO schema_migrations (name) VALUES (?)', [migration.name]);
  }
}

// Splits the script into statements, honouring the DELIMITER lines used for triggers.
function readScript() {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'database', 'cam_orphanage_connect.sql');
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^DELIMITER\s+/i.test(trimmed)) {
      delimiter = trimmed.split(/\s+/)[1];
      continue;
    }
    if (!buffer && (trimmed === '' || trimmed.startsWith('--'))) continue;
    buffer += line + '\n';
    if (trimmed.endsWith(delimiter)) {
      const statement = buffer.trim().slice(0, -delimiter.length).trim();
      buffer = '';
      // The script starts by dropping and creating the database; setup has done that already.
      if (/^(DROP DATABASE|CREATE DATABASE|USE)\b/i.test(statement)) continue;
      if (/^SELECT\b.*is ready/is.test(statement)) continue;
      if (statement) statements.push(statement);
    }
  }
  return statements;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { q, one, run, tx, sqlTime, isoTime, dateOnly, ensureDatabase, close, DB_NAME };
