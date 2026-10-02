const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { HttpError } = require('../errors');
const mailer = require('../mailer');
const loginGuard = require('../loginGuard');

// Password reset by email. The emailed token is long and random; only its SHA-256 fingerprint is
// stored (password_reset_tokens), so a copy of the database cannot be used to reset anyone.

const TOKEN_LIFETIME_MINUTES = 60;
const MAX_REQUESTS_PER_HOUR = 3;

const fingerprint = (token) => crypto.createHash('sha256').update(token).digest('hex');

// The address links in emails point to. Never taken from the request, so nobody can make the
// site send reset links to a look-alike address.
function siteUrl() {
  return (process.env.SITE_URL || 'http://localhost:' + (process.env.PORT || 4000)).replace(/\/+$/, '');
}

// Returns true when an email was sent (or printed locally). Says nothing about whether the
// address has an account, so the caller can answer everyone the same way.
async function requestReset(email, ip) {
  const user = await db.one(
    "SELECT id, display_name, email FROM users WHERE email = ? AND role IN ('donor', 'orphanage', 'partner') AND status = 'active'",
    [String(email).trim().toLowerCase()]
  );
  if (!user) return false;

  const recent = await db.one('SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND created_at > ?', [user.id, db.sqlTime(Date.now() - 3600 * 1000)]);
  if (recent.n >= MAX_REQUESTS_PER_HOUR) return false;

  const token = crypto.randomBytes(32).toString('hex');
  await db.run(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, ?, ?)',
    [user.id, fingerprint(token), db.sqlTime(Date.now() + TOKEN_LIFETIME_MINUTES * 60 * 1000), String(ip || '').slice(0, 45) || null]
  );

  const link = siteUrl() + '/login/reset-password.html?token=' + token;
  const text = [
    'Hello ' + user.display_name + ',',
    '',
    'Someone asked to reset the password of your CAM Orphanage Connect account.',
    'To choose a new password, open this link within ' + TOKEN_LIFETIME_MINUTES + ' minutes:',
    '',
    link,
    '',
    'If you did not ask for this, you can ignore this email. Your password stays the same.',
    '',
    'CAM Orphanage Connect',
  ].join('\n');
  const html = '<p>Hello ' + escapeHtml(user.display_name) + ',</p>' +
    '<p>Someone asked to reset the password of your CAM Orphanage Connect account.</p>' +
    '<p><a href="' + link + '">Choose a new password</a><br>The link works for ' + TOKEN_LIFETIME_MINUTES + ' minutes.</p>' +
    '<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>' +
    '<p>CAM Orphanage Connect</p>';

  await mailer.sendMail({ to: user.email, subject: 'Reset your CAM Orphanage Connect password', text, html });
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function resetPassword(token, newPassword) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new HttpError(400, 'This reset link is not valid. Please ask for a new one.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters.');
  }

  const email = await db.tx(async () => {
    const row = await db.one(
      'SELECT t.id, t.user_id, u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ? FOR UPDATE',
      [fingerprint(token), db.sqlTime()]
    );
    if (!row) throw new HttpError(400, 'This reset link has expired or was already used. Please ask for a new one.');

    await db.run('UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?', [bcrypt.hashSync(newPassword, 10), row.user_id]);
    // This link and any older ones stop working.
    await db.run('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [db.sqlTime(), row.user_id]);
    return row.email;
  });
  // Someone locked out by wrong passwords can sign in with the new one straight away.
  loginGuard.clear(email);
}

module.exports = { requestReset, resetPassword };
