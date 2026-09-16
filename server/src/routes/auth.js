const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.trim().toLowerCase());
  if (!admin) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const passwordMatches = bcrypt.compareSync(password, admin.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  });
});

router.get('/me', authenticate, (req, res) => {
  const admin = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin account no longer exists.' });
  }
  res.json({ admin });
});

module.exports = router;
