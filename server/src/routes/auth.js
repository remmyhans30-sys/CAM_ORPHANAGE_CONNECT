const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { admins } = require('../repo/admin-data');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = await admins.byEmail(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { type: 'admin', id: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    admin: { id: admin.id, name: admin.display_name, email: admin.email, role: admin.role },
  });
});

router.get('/me', authenticate, async (req, res) => {
  const admin = await admins.get(req.admin.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin account no longer exists.' });
  }
  res.json({ admin });
});

module.exports = router;
