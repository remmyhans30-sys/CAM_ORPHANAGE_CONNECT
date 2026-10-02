// Prints the SQL that creates the first administrator account.
//
//   node database/make-admin-sql.js you@example.com "Your Name" "a strong password"
//
// Copy the output into a MySQL Workbench query tab and run it.
// The password is stored as a bcrypt hash, the same way the website does it.

const path = require('path');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error('Usage: node database/make-admin-sql.js <email> "<display name>" "<password>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Please use a password of at least 10 characters.');
  process.exit(1);
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
const hash = bcrypt.hashSync(password, 10);

console.log(`USE cam_orphanage_connect;

INSERT INTO users (email, password_hash, role, display_name)
VALUES (${q(email)}, ${q(hash)}, 'admin', ${q(name)});

INSERT INTO admin_profiles (user_id, admin_role_id)
VALUES (LAST_INSERT_ID(), (SELECT id FROM admin_roles WHERE name = 'Super Admin'));`);
