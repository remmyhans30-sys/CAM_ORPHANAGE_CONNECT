const bcrypt = require('bcryptjs');
const db = require('./db');

const LOCAL_DEFAULT = { email: 'admin@camorphanage.org', password: 'ChangeMe123!' };

// Creates the first admin when there is none yet, from ADMIN_EMAIL / ADMIN_PASSWORD
// (set these on the live site). Only local runs may fall back to the public default.
function ensureFirstAdmin({ allowDefault }) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
  if (count > 0) return { created: false };

  const fromSettings = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  if (!fromSettings && !allowDefault) return { created: false, missingSettings: true };

  const email = (fromSettings ? process.env.ADMIN_EMAIL : LOCAL_DEFAULT.email).trim().toLowerCase();
  const password = fromSettings ? process.env.ADMIN_PASSWORD : LOCAL_DEFAULT.password;
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  db.prepare('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(process.env.ADMIN_NAME || 'Super Admin', email, bcrypt.hashSync(password, 10), 'Super Admin');

  return { created: true, email: email, usedDefault: !fromSettings };
}

module.exports = { ensureFirstAdmin, LOCAL_DEFAULT };
