const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToDonor(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    joinDate: row.join_date,
    location: row.location,
    preferredPayment: row.preferred_payment,
    preferredCurrency: row.preferred_currency,
    lastActive: row.last_active,
    vip: Boolean(row.vip),
    status: row.status,
    flagReason: row.flag_reason,
    totalGiven: row.total_given,
    donationsCount: row.donations_count,
    homesFollowedCount: row.homes_followed_count,
    activeRecurringGifts: row.active_recurring_gifts,
    chargebacksCount: row.chargebacks_count,
    photoUrl: row.photo_url,
    referredBy: row.referred_by,
    adminNotes: row.admin_notes,
    donations: JSON.parse(row.donations),
    passwordResets: JSON.parse(row.password_resets),
    failedPayments: JSON.parse(row.failed_payments),
    supportTickets: JSON.parse(row.support_tickets),
    referralsMade: JSON.parse(row.referrals_made),
    homesFollowed: JSON.parse(row.homes_followed),
    groupsJoined: JSON.parse(row.groups_joined),
    activityLog: JSON.parse(row.activity_log),
  };
}

const FIELD_MAP = {
  name: 'name',
  email: 'email',
  joinDate: 'join_date',
  location: 'location',
  preferredPayment: 'preferred_payment',
  preferredCurrency: 'preferred_currency',
  lastActive: 'last_active',
  vip: 'vip',
  status: 'status',
  flagReason: 'flag_reason',
  totalGiven: 'total_given',
  donationsCount: 'donations_count',
  homesFollowedCount: 'homes_followed_count',
  activeRecurringGifts: 'active_recurring_gifts',
  chargebacksCount: 'chargebacks_count',
  photoUrl: 'photo_url',
  referredBy: 'referred_by',
  adminNotes: 'admin_notes',
};

const JSON_FIELDS = {
  donations: 'donations',
  passwordResets: 'password_resets',
  failedPayments: 'failed_payments',
  supportTickets: 'support_tickets',
  referralsMade: 'referrals_made',
  homesFollowed: 'homes_followed',
  groupsJoined: 'groups_joined',
  activityLog: 'activity_log',
};

const BOOLEAN_COLUMNS = new Set(['vip']);

function bodyToColumns(body) {
  const columns = {};

  Object.keys(FIELD_MAP).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const column = FIELD_MAP[key];
      const value = body[key];
      columns[column] = BOOLEAN_COLUMNS.has(column) ? (value ? 1 : 0) : value;
    }
  });

  Object.keys(JSON_FIELDS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      columns[JSON_FIELDS[key]] = JSON.stringify(body[key] || []);
    }
  });

  return columns;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM donors ORDER BY id DESC').all();
  res.json({ donors: rows.map(rowToDonor) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM donors WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Donor not found.' });
  res.json({ donor: rowToDonor(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO donors (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM donors WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ donor: rowToDonor(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM donors WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Donor not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE donors SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM donors WHERE id = ?').get(req.params.id);
  res.json({ donor: rowToDonor(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM donors WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Donor not found.' });
  res.status(204).send();
});

module.exports = router;
