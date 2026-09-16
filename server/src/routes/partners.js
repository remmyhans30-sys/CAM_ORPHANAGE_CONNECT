const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToPartner(row) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    country: row.country,
    submittedDate: row.submitted_date,
    verificationStatus: row.verification_status,
    orgType: row.org_type,
    tier: row.tier,
    status: row.status,
    flagReason: row.flag_reason,
    totalContributed: row.total_contributed,
    placementReferralsCount: row.placement_referrals_count,
    logoUrl: row.logo_url,
    sponsoredByBlurb: row.sponsored_by_blurb,
    wordingApproved: Boolean(row.wording_approved),
    sanctionsScreened: Boolean(row.sanctions_screened),
    infoRequestMessage: row.info_request_message,
    rejectionReason: row.rejection_reason,
    appealMessage: row.appeal_message,
    appealDate: row.appeal_date,
    adminNotes: row.admin_notes,
    pledge: row.pledge ? JSON.parse(row.pledge) : null,
    orphanagesSponsored: JSON.parse(row.orphanages_sponsored),
    documents: JSON.parse(row.documents),
    placementCases: JSON.parse(row.placement_cases),
    activityLog: JSON.parse(row.activity_log),
  };
}

const FIELD_MAP = {
  name: 'name',
  contactName: 'contact_name',
  email: 'email',
  country: 'country',
  submittedDate: 'submitted_date',
  verificationStatus: 'verification_status',
  orgType: 'org_type',
  tier: 'tier',
  status: 'status',
  flagReason: 'flag_reason',
  totalContributed: 'total_contributed',
  placementReferralsCount: 'placement_referrals_count',
  logoUrl: 'logo_url',
  sponsoredByBlurb: 'sponsored_by_blurb',
  wordingApproved: 'wording_approved',
  sanctionsScreened: 'sanctions_screened',
  infoRequestMessage: 'info_request_message',
  rejectionReason: 'rejection_reason',
  appealMessage: 'appeal_message',
  appealDate: 'appeal_date',
  adminNotes: 'admin_notes',
};

const JSON_FIELDS = {
  orphanagesSponsored: 'orphanages_sponsored',
  documents: 'documents',
  placementCases: 'placement_cases',
  activityLog: 'activity_log',
};

const BOOLEAN_COLUMNS = new Set(['wording_approved', 'sanctions_screened']);

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

  if (Object.prototype.hasOwnProperty.call(body, 'pledge')) {
    columns.pledge = body.pledge ? JSON.stringify(body.pledge) : null;
  }

  return columns;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM partners ORDER BY id DESC').all();
  res.json({ partners: rows.map(rowToPartner) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Partner organization not found.' });
  res.json({ partner: rowToPartner(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO partners (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ partner: rowToPartner(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM partners WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Partner organization not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE partners SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  res.json({ partner: rowToPartner(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM partners WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Partner organization not found.' });
  res.status(204).send();
});

module.exports = router;
