const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateUser, userSecret } = require('../middleware/userAuth');
const orphanages = require('../repo/orphanages');
const donors = require('../repo/donors');
const passwordReset = require('../repo/passwordReset');
const common = require('../repo/common');
const mailer = require('../mailer');

const router = express.Router();

// Donor/orphanage accounts from the public login pages. Tokens are signed with a
// different secret than admin tokens, so they can never pass the admin API's auth.
// Admins and partners have their own sign-in.
// The pages call a donor 'user' and an orphanage 'volunteer'; the database says donor / orphanage.
const ROLE_IN = { user: 'donor', volunteer: 'orphanage' };
const ROLE_OUT = { donor: 'user', orphanage: 'volunteer' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Written into the account's history when someone signs up, as a record of what they agreed to.
const TERMS_NOTE = 'Confirmed being 18 or older and agreed to the terms of use (version 1)';

function toPublicUser(row) {
  return { id: row.id, fullname: row.display_name, email: row.email, role: ROLE_OUT[row.role] };
}

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: ROLE_OUT[user.role] }, userSecret(), { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const { fullname, email, password, role, acceptTerms } = req.body || {};

  if (!fullname || !fullname.trim() || !email || !password || !role) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (acceptTerms !== true) {
    return res.status(400).json({ error: 'Please confirm that you are 18 or older and agree to the terms of use.' });
  }
  if (!ROLE_IN[role]) {
    return res.status(400).json({ error: 'Please choose a valid account type.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (await db.one('SELECT id FROM users WHERE email = ?', [normalizedEmail])) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const user = await db.tx(async () => {
    const result = await db.run(
      'INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
      [normalizedEmail, bcrypt.hashSync(password, 10), ROLE_IN[role], fullname.trim().slice(0, 150)]
    );
    const created = await db.one('SELECT * FROM users WHERE id = ?', [result.insertId]);
    if (created.role === 'orphanage') {
      const home = await orphanages.ensureForUser(created);
      await common.logActivity('orphanage', home.id, TERMS_NOTE, created.email, created.id);
    } else {
      await donors.ensureForUser(created);
      await common.logActivity('donor', created.id, TERMS_NOTE, created.email, created.id);
    }
    return created;
  });
  res.status(201).json({ token: issueToken(user), user: toPublicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }

  const user = await db.one("SELECT * FROM users WHERE email = ? AND role IN ('donor', 'orphanage') AND status = 'active'", [email.trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [db.sqlTime(), user.id]);
  res.json({ token: issueToken(user), user: toPublicUser(user) });
});

// Password reset by email. Everyone gets the same answer, so the page cannot be used to find
// out who has an account. If the site cannot send email, it says so honestly.
const resetAsks = new Map();

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};

  if (!email || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!mailer.canDeliver() && !mailer.canPrintToConsole()) {
    const contact = process.env.SUPPORT_EMAIL ? ' at ' + process.env.SUPPORT_EMAIL : '';
    return res.json({
      message: 'Password reset by email is not available yet. Please contact the CAM Orphanage Connect team' + contact +
        ' from the email address you signed up with, and we will help you get back in.',
    });
  }

  // A small limit per computer, on top of the per-account limit.
  const now = Date.now();
  const recent = (resetAsks.get(req.ip) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= 20) {
    return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
  }
  recent.push(now);
  resetAsks.set(req.ip, recent);

  try {
    await passwordReset.requestReset(email, req.ip);
  } catch (err) {
    console.error('Could not send a password reset email: ' + err.message);
  }

  res.json({
    message: mailer.canDeliver()
      ? 'If an account exists for that email, we have sent a link to choose a new password. It works for one hour. Please check your spam folder too.'
      : 'Email is not set up on this computer, so nothing was sent. If an account exists, the reset link was printed in the black server window.',
  });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  await passwordReset.resetPassword(token, password);
  res.json({ message: 'Your password has been changed. You can now sign in with it.' });
});

router.get('/me', authenticateUser, async (req, res) => {
  const user = await db.one("SELECT * FROM users WHERE id = ? AND role IN ('donor', 'orphanage')", [req.user.id]);
  if (!user) {
    return res.status(404).json({ error: 'Account no longer exists.' });
  }
  res.json({ user: toPublicUser(user) });
});

module.exports = router;
module.exports.ROLE_OUT = ROLE_OUT;
