const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToSettings(row) {
  return {
    orgName: row.org_name,
    orgEmail: row.org_email,
    orgPhone: row.org_phone,
    orgAddress: row.org_address,
    orgDescription: row.org_description,
    currency: row.currency,
    notifEmail: Boolean(row.notif_email),
    notifDonations: Boolean(row.notif_donations),
    notifMessages: Boolean(row.notif_messages),
  };
}

function getOrCreateRow() {
  let row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
    row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  }
  return row;
}

const FIELD_MAP = {
  orgName: 'org_name',
  orgEmail: 'org_email',
  orgPhone: 'org_phone',
  orgAddress: 'org_address',
  orgDescription: 'org_description',
  currency: 'currency',
  notifEmail: 'notif_email',
  notifDonations: 'notif_donations',
  notifMessages: 'notif_messages',
};

const BOOLEAN_COLUMNS = new Set(['notif_email', 'notif_donations', 'notif_messages']);

router.get('/', (req, res) => {
  res.json({ settings: rowToSettings(getOrCreateRow()) });
});

router.put('/', (req, res) => {
  getOrCreateRow();

  const body = req.body || {};
  const columns = {};
  Object.keys(FIELD_MAP).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const column = FIELD_MAP[key];
      const value = body[key];
      columns[column] = BOOLEAN_COLUMNS.has(column) ? (value ? 1 : 0) : value;
    }
  });

  const keys = Object.keys(columns);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE settings SET ${setClause} WHERE id = 1`).run(...keys.map((k) => columns[k]));
  }

  res.json({ settings: rowToSettings(getOrCreateRow()) });
});

module.exports = router;
