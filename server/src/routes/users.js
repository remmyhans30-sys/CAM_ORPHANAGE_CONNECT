const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateUser, userSecret } = require('../middleware/userAuth');
const { ensureOrphanageForUser } = require('../orphanageAccounts');

const router = express.Router();

// Donor/orphanage accounts from the public login pages. Tokens are signed with a
// different secret than admin tokens, so they can never pass the admin API's auth.
// Admins are not created here — they live in the admins table.
const ROLES = ['user', 'volunteer'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicUser(row) {
  return { id: row.id, fullname: row.fullname, email: row.email, role: row.role };
}

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, userSecret(), { expiresIn: '7d' });
}

router.post('/register', (req, res) => {
  const { fullname, email, password, role } = req.body || {};

  if (!fullname || !fullname.trim() || !email || !password || !role) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Please choose a valid account type.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const result = db
    .prepare('INSERT INTO users (fullname, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(fullname.trim(), normalizedEmail, bcrypt.hashSync(password, 10), role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  if (user.role === 'volunteer') {
    ensureOrphanageForUser(user);
  }
  res.status(201).json({ token: issueToken(user), user: toPublicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ token: issueToken(user), user: toPublicUser(user) });
});

// No email service yet: always answer the same way so this can't be used to
// find out which emails have accounts.
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};

  if (!email || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
});

router.get('/me', authenticateUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Account no longer exists.' });
  }
  res.json({ user: toPublicUser(user) });
});

module.exports = router;
