const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToAdmin(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function hasAdminAccess(role) {
  return role === 'Super Admin' || role === 'Administrator';
}

function countOtherAdmins(excludeId) {
  const rows = db.prepare("SELECT id, role FROM admins WHERE id != ?").all(excludeId);
  return rows.filter((r) => hasAdminAccess(r.role)).length;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, name, email, role FROM admins ORDER BY id ASC').all();
  res.json({ admins: rows.map(rowToAdmin) });
});

router.post('/', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.trim().toLowerCase(), passwordHash, role || 'Content Manager');

  const row = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ admin: rowToAdmin(row) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const { name, email, password, role } = req.body || {};

  if (role && hasAdminAccess(existing.role) && !hasAdminAccess(role) && countOtherAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot change this role — it is the last Super Admin/Administrator account and would lock everyone out of Users & Roles and Settings.' });
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email.trim().toLowerCase();
  if (role !== undefined) updates.role = role;
  if (password) updates.password_hash = bcrypt.hashSync(password, 10);

  const keys = Object.keys(updates);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE admins SET ${setClause} WHERE id = ?`).run(...keys.map((k) => updates[k]), id);
  }

  const row = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ?').get(id);
  res.json({ admin: rowToAdmin(row) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  if (hasAdminAccess(existing.role) && countOtherAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot delete the last Super Admin/Administrator account — this would lock everyone out of Users & Roles and Settings.' });
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
