const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToOrphanage(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    registrationNumber: row.registration_number,
    story: row.story,
    storyLanguage: row.story_language,
    status: row.status,
    childrenCount: row.children_count,
    followersCount: row.followers_count,
    foundedYear: row.founded_year,
    capacity: row.capacity,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    termsAgreed: Boolean(row.terms_agreed),
    photoUrl: row.photo_url,
    coverPhotoUrl: row.cover_photo_url,
    paymentProvider: row.payment_provider,
    paymentAccountName: row.payment_account_name,
    paymentAccountNumber: row.payment_account_number,
    paymentAccountConfirmed: Boolean(row.payment_account_confirmed),
    flagged: Boolean(row.flagged),
    flagReason: row.flag_reason,
    rejectionReason: row.rejection_reason,
    appealMessage: row.appeal_message,
    appealDate: row.appeal_date,
    infoRequestMessage: row.info_request_message,
    submittedDate: row.submitted_date,
    blurFaces: Boolean(row.blur_faces),
    showFullNames: Boolean(row.show_full_names),
    documents: JSON.parse(row.documents),
    gallery: JSON.parse(row.gallery),
    posts: JSON.parse(row.posts),
    activityLog: JSON.parse(row.activity_log),
  };
}

const FIELD_MAP = {
  name: 'name',
  location: 'location',
  registrationNumber: 'registration_number',
  story: 'story',
  storyLanguage: 'story_language',
  status: 'status',
  childrenCount: 'children_count',
  followersCount: 'followers_count',
  foundedYear: 'founded_year',
  capacity: 'capacity',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  termsAgreed: 'terms_agreed',
  photoUrl: 'photo_url',
  coverPhotoUrl: 'cover_photo_url',
  paymentProvider: 'payment_provider',
  paymentAccountName: 'payment_account_name',
  paymentAccountNumber: 'payment_account_number',
  paymentAccountConfirmed: 'payment_account_confirmed',
  flagged: 'flagged',
  flagReason: 'flag_reason',
  rejectionReason: 'rejection_reason',
  appealMessage: 'appeal_message',
  appealDate: 'appeal_date',
  infoRequestMessage: 'info_request_message',
  submittedDate: 'submitted_date',
  blurFaces: 'blur_faces',
  showFullNames: 'show_full_names',
};

const JSON_FIELDS = { documents: 'documents', gallery: 'gallery', posts: 'posts', activityLog: 'activity_log' };
const BOOLEAN_COLUMNS = new Set(['terms_agreed', 'payment_account_confirmed', 'flagged', 'blur_faces', 'show_full_names']);

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
  const rows = db.prepare('SELECT * FROM orphanages ORDER BY id DESC').all();
  res.json({ orphanages: rows.map(rowToOrphanage) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM orphanages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json({ orphanage: rowToOrphanage(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO orphanages (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM orphanages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ orphanage: rowToOrphanage(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM orphanages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Orphanage not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE orphanages SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM orphanages WHERE id = ?').get(req.params.id);
  res.json({ orphanage: rowToOrphanage(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM orphanages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Orphanage not found.' });
  res.status(204).send();
});

module.exports = router;
