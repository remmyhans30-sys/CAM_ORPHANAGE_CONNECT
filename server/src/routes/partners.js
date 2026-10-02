const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const partners = require('../repo/partners');

const router = express.Router();
router.use(authenticate);

const actorOf = (req) => ({ userId: req.admin.id, email: req.admin.email, isAdmin: true });

router.get('/', async (req, res) => {
  res.json({ partners: await partners.list() });
});

router.get('/:id', async (req, res) => {
  const partner = await partners.get(req.params.id);
  if (!partner) return res.status(404).json({ error: 'Partner organization not found.' });
  res.json({ partner });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  const id = await partners.createByAdmin(body);
  res.status(201).json({ partner: await partners.save(id, body, actorOf(req)) });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (body.password && body.password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = await partners.get(id);
  if (!existing) return res.status(404).json({ error: 'Partner organization not found.' });
  if (body.password) {
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(body.password, 10), existing.ownerUserId]);
  }
  res.json({ partner: await partners.save(id, body, actorOf(req)) });
});

router.delete('/:id', async (req, res) => {
  if (!(await partners.remove(Number(req.params.id)))) return res.status(404).json({ error: 'Partner organization not found.' });
  res.status(204).send();
});

module.exports = router;
