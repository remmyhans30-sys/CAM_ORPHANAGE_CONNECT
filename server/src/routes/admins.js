const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../middleware/auth');
const { admins } = require('../repo/admin-data');

const router = express.Router();
router.use(authenticate);

function hasAdminAccess(role) {
  return role === 'Super Admin' || role === 'Administrator';
}

async function countOtherAdmins(excludeId) {
  return (await admins.list()).filter((a) => a.id !== excludeId && hasAdminAccess(a.role)).length;
}

router.get('/', async (req, res) => {
  res.json({ admins: await admins.list() });
});

router.post('/', async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  if (await admins.byEmail(email)) return res.status(400).json({ error: 'An account with this email already exists.' });

  const admin = await admins.create(
    { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: bcrypt.hashSync(password, 10), role: role || 'Content Manager' },
    req.admin.id
  );
  res.status(201).json({ admin });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await admins.get(id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const { name, email, password, role } = req.body || {};

  if (role && hasAdminAccess(existing.role) && !hasAdminAccess(role) && (await countOtherAdmins(id)) === 0) {
    return res.status(400).json({ error: 'Cannot change this role — it is the last Super Admin/Administrator account and would lock everyone out of Users & Roles and Settings.' });
  }

  const admin = await admins.update(id, {
    name: name !== undefined ? name.trim() : undefined,
    email: email !== undefined ? email.trim().toLowerCase() : undefined,
    passwordHash: password ? bcrypt.hashSync(password, 10) : undefined,
    role: role,
  });
  res.json({ admin });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await admins.get(id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  if (hasAdminAccess(existing.role) && (await countOtherAdmins(id)) === 0) {
    return res.status(400).json({ error: 'Cannot delete the last Super Admin/Administrator account — this would lock everyone out of Users & Roles and Settings.' });
  }

  await admins.remove(id);
  res.status(204).send();
});

module.exports = router;
