const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');
const common = require('./repo/common');
const { HttpError } = require('./errors');

// Email confirmation. At sign-up the site emails a link; opening it shows that the address belongs to
// the person who signed up. People can sign in and fill in their profile before that, but an admin can
// approve a donor, or verify an orphanage or partner, only once its address is confirmed. Accounts an
// admin added by hand have no login and are exempt.
//
// Where the site cannot send email (the live site without SMTP settings), or with EMAIL_CONFIRMATION=off,
// it is switched off: no links are sent and approvals do not wait.
//
// The link carries the account id, an expiry time and a signature over both and the email address, so
// nothing has to be stored. A changed address makes old links useless, and the database clears the
// confirmation (trigger trg_users_email_update), so the new address has to be confirmed again.

const LINK_DAYS = 7;
const MAX_SENDS_PER_HOUR = 3;
const NO_LOGIN = '!no-login-';
const sends = new Map(); // account id -> times of its recent confirmation emails

function required() {
  return String(process.env.EMAIL_CONFIRMATION || '').trim().toLowerCase() !== 'off' &&
    (mailer.canDeliver() || mailer.canPrintToConsole());
}

// Must an approval wait for this account to confirm its address?
function waiting(confirmedAt, noLogin) {
  return required() && !confirmedAt && !noLogin;
}

function signature(userId, email, expires) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET + ':email').update(userId + '.' + email + '.' + expires).digest('hex');
}

function tokenFor(user) {
  const expires = Math.floor(Date.now() / 1000) + LINK_DAYS * 24 * 3600;
  return user.id + '.' + expires + '.' + signature(user.id, user.email, expires);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Emails a confirmation link. Returns 'sent', 'printed' (local computer without email), 'confirmed'
// (nothing to do), 'limited' (too many links in the last hour) or 'unavailable'.
async function send(userId) {
  const user = await db.one(
    "SELECT id, email, display_name, email_verified_at, password_hash FROM users WHERE id = ? AND role IN ('donor', 'orphanage', 'partner')",
    [userId]
  );
  if (!user || user.password_hash.startsWith(NO_LOGIN) || /\.invalid$/i.test(user.email)) return 'unavailable';
  if (user.email_verified_at) return 'confirmed';
  if (!required()) return 'unavailable';

  const now = Date.now();
  const recent = (sends.get(user.id) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= MAX_SENDS_PER_HOUR) return 'limited';
  recent.push(now);
  sends.set(user.id, recent);

  const link = mailer.siteUrl() + '/login/confirm-email.html?token=' + tokenFor(user);
  const text = [
    'Hello ' + user.display_name + ',',
    '',
    'Thank you for joining CAM Orphanage Connect. Please confirm that this is your email address',
    'by opening this link within ' + LINK_DAYS + ' days:',
    '',
    link,
    '',
    'The team can review your account once your address is confirmed.',
    'If you did not create this account, you can ignore this email.',
    '',
    'CAM Orphanage Connect',
  ].join('\n');
  const html = '<p>Hello ' + escapeHtml(user.display_name) + ',</p>' +
    '<p>Thank you for joining CAM Orphanage Connect. Please confirm that this is your email address.</p>' +
    '<p><a href="' + link + '">Confirm my email address</a><br>The link works for ' + LINK_DAYS + ' days.</p>' +
    '<p>The team can review your account once your address is confirmed. If you did not create this account, you can ignore this email.</p>' +
    '<p>CAM Orphanage Connect</p>';

  const result = await mailer.sendMail({ to: user.email, subject: 'Confirm your email address for CAM Orphanage Connect', text, html });
  return result.sent ? 'sent' : 'printed';
}

// Sends the first link after a sign-up, without making the person wait for the mail server.
function sendLater(userId) {
  setImmediate(() => {
    send(userId).catch((err) => console.error('Could not send the email confirmation link: ' + err.message));
  });
}

// The history line for the account (shown to admins), on the record the admin pages use.
async function logConfirmed(user) {
  if (user.role === 'donor') return common.logActivity('donor', user.id, 'Confirmed their email address', user.email, user.id);
  const table = user.role === 'orphanage' ? 'orphanages' : 'partner_organizations';
  const record = await db.one('SELECT id FROM ' + table + ' WHERE owner_user_id = ? ORDER BY id LIMIT 1', [user.id]);
  if (record) await common.logActivity(user.role, record.id, 'Confirmed their email address', user.email, user.id);
}

// Confirms the address the link was sent to. Returns { role, alreadyConfirmed }.
async function confirm(token) {
  const m = /^(\d{1,19})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(typeof token === 'string' ? token : '');
  if (!m) throw new HttpError(400, 'This confirmation link is not valid. Sign in and ask for a new one.');
  const [, id, expires, given] = m;

  const user = await db.one("SELECT id, email, role, email_verified_at FROM users WHERE id = ? AND role IN ('donor', 'orphanage', 'partner')", [id]);
  const expected = user ? signature(user.id, user.email, expires) : null;
  if (!expected || !crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new HttpError(400, 'This confirmation link is not valid any more. Sign in and ask for a new one.');
  }
  if (Number(expires) * 1000 < Date.now()) {
    throw new HttpError(400, 'This confirmation link has expired. Sign in and ask for a new one.');
  }

  if (!user.email_verified_at) {
    await db.run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email = ? AND email_verified_at IS NULL', [db.sqlTime(), user.id, user.email]);
    await logConfirmed(user);
  }
  return { role: user.role, alreadyConfirmed: Boolean(user.email_verified_at) };
}

const WAITING_MESSAGES = {
  donor: 'This donor has not confirmed their email address yet, so the account cannot be approved. They need to open the link we emailed them (they can ask for a new one when they sign in).',
  orphanage: 'This orphanage has not confirmed its email address yet, so it cannot be verified. The account holder needs to open the link we emailed them (they can ask for a new one in their portal).',
  partner: 'This organization has not confirmed its email address yet, so it cannot be verified. The account holder needs to open the link we emailed them (they can ask for a new one on their profile page).',
};

// Called before an admin approves or verifies an account.
async function checkBeforeApproval(userId, kind) {
  if (!required()) return;
  const user = await db.one('SELECT email_verified_at, password_hash FROM users WHERE id = ?', [userId]);
  if (user && waiting(user.email_verified_at, user.password_hash.startsWith(NO_LOGIN))) {
    throw new HttpError(400, WAITING_MESSAGES[kind]);
  }
}

module.exports = { LINK_DAYS, NO_LOGIN, required, waiting, send, sendLater, confirm, checkBeforeApproval };
