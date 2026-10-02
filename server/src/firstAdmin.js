const bcrypt = require('bcryptjs');
const { admins } = require('./repo/admin-data');

const LOCAL_DEFAULT = { email: 'admin@camorphanage.org', password: 'ChangeMe123!' };

// Creates the first admin when there is none yet, from ADMIN_EMAIL / ADMIN_PASSWORD
// (set these on the live site). Only local runs may fall back to the public default.
async function ensureFirstAdmin({ allowDefault }) {
  if ((await admins.count()) > 0) return { created: false };

  const fromSettings = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  if (!fromSettings && !allowDefault) return { created: false, missingSettings: true };

  const email = (fromSettings ? process.env.ADMIN_EMAIL : LOCAL_DEFAULT.email).trim().toLowerCase();
  const password = fromSettings ? process.env.ADMIN_PASSWORD : LOCAL_DEFAULT.password;
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  await admins.create({
    name: process.env.ADMIN_NAME || 'Super Admin',
    email: email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'Super Admin',
  });

  return { created: true, email: email, usedDefault: !fromSettings };
}

module.exports = { ensureFirstAdmin, LOCAL_DEFAULT };
