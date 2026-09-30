const express = require('express');
const db = require('../db');
const { authenticateUser } = require('../middleware/userAuth');
const { ensureOrphanageForUser } = require('../orphanageAccounts');

// The signed-in orphanage account's own profile and needs (orphanage/ portal).
// Status, verification and payment fields stay admin-only.
const router = express.Router();
router.use(authenticateUser);

router.use((req, res, next) => {
  if (req.user.role !== 'volunteer') {
    return res.status(403).json({ error: 'Only orphanage accounts can use the portal.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  req.orphanage = ensureOrphanageForUser(user);
  next();
});

const PROFILE_FIELDS = {
  name: 'name',
  location: 'location',
  foundedYear: 'founded_year',
  childrenCount: 'children_count',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  story: 'story',
};
const NUMBER_COLUMNS = new Set(['founded_year', 'children_count']);

function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    foundedYear: row.founded_year,
    childrenCount: row.children_count,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    story: row.story,
    status: row.status,
    infoRequestMessage: row.info_request_message,
    rejectionReason: row.rejection_reason,
  };
}

function rowToNeed(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    goal: row.goal,
    raised: row.raised,
    percent: row.percent,
    date: row.date,
  };
}

function listNeeds(orphanageId) {
  return db.prepare('SELECT * FROM needs WHERE orphanage_id = ? ORDER BY id DESC').all(orphanageId).map(rowToNeed);
}

function appendActivity(orphanage, action) {
  const log = JSON.parse(orphanage.activity_log || '[]');
  log.push({ action: action, reviewer: orphanage.contact_email, timestamp: new Date().toISOString() });
  return JSON.stringify(log);
}

function parseGoal(value) {
  const goal = Number(value);
  return Number.isInteger(goal) && goal > 0 ? goal : null;
}

router.get('/', (req, res) => {
  res.json({ orphanage: rowToProfile(req.orphanage), needs: listNeeds(req.orphanage.id) });
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const sets = [];
  const values = [];

  for (const key of Object.keys(PROFILE_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const column = PROFILE_FIELDS[key];
    let value = typeof body[key] === 'string' ? body[key].trim() : body[key];

    if (NUMBER_COLUMNS.has(column)) {
      value = value === '' || value === null ? null : Number(value);
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        return res.status(400).json({ error: 'Founded year and children in care must be whole numbers.' });
      }
    }
    if (column === 'name' && !value) {
      return res.status(400).json({ error: 'Orphanage name cannot be empty.' });
    }

    sets.push(column + ' = ?');
    values.push(value === '' ? null : value);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  sets.push("activity_log = ?", "updated_at = datetime('now')");
  values.push(appendActivity(req.orphanage, 'Profile updated by orphanage'));

  db.prepare('UPDATE orphanages SET ' + sets.join(', ') + ' WHERE id = ?').run(...values, req.orphanage.id);
  const updated = db.prepare('SELECT * FROM orphanages WHERE id = ?').get(req.orphanage.id);
  res.json({ orphanage: rowToProfile(updated) });
});

router.post('/needs', (req, res) => {
  const { title, description, goal } = req.body || {};
  const goalAmount = parseGoal(goal);

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Please give the need a title.' });
  }
  if (!goalAmount) {
    return res.status(400).json({ error: 'Goal amount must be a positive whole number.' });
  }

  const result = db
    .prepare('INSERT INTO needs (orphanage_id, title, description, goal, raised, percent, date) VALUES (?, ?, ?, ?, 0, 0, ?)')
    .run(req.orphanage.id, title.trim(), (description || '').trim() || null, goalAmount, new Date().toISOString().slice(0, 10));

  res.status(201).json({ need: rowToNeed(db.prepare('SELECT * FROM needs WHERE id = ?').get(result.lastInsertRowid)) });
});

function findOwnNeed(req, res) {
  const need = db.prepare('SELECT * FROM needs WHERE id = ? AND orphanage_id = ?').get(req.params.id, req.orphanage.id);
  if (!need) {
    res.status(404).json({ error: 'Need not found.' });
  }
  return need;
}

router.put('/needs/:id', (req, res) => {
  const need = findOwnNeed(req, res);
  if (!need) return;

  const { title, description, goal } = req.body || {};
  const goalAmount = parseGoal(goal);

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Please give the need a title.' });
  }
  if (!goalAmount || goalAmount < need.raised) {
    return res.status(400).json({ error: 'Goal must be a positive whole number and not below what is already raised.' });
  }

  const percent = Math.min(100, Math.round((need.raised / goalAmount) * 100));
  db.prepare("UPDATE needs SET title = ?, description = ?, goal = ?, percent = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim(), (description || '').trim() || null, goalAmount, percent, need.id);

  res.json({ need: rowToNeed(db.prepare('SELECT * FROM needs WHERE id = ?').get(need.id)) });
});

router.delete('/needs/:id', (req, res) => {
  const need = findOwnNeed(req, res);
  if (!need) return;

  if (need.raised > 0) {
    return res.status(400).json({ error: 'This need has already received donations and cannot be removed.' });
  }

  db.prepare('DELETE FROM needs WHERE id = ?').run(need.id);
  res.status(204).end();
});

module.exports = router;
