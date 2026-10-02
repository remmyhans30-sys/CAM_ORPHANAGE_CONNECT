const express = require('express');
const db = require('../db');
const { authenticateUser } = require('../middleware/userAuth');
const orphanages = require('../repo/orphanages');
const needs = require('../repo/needs');
const donations = require('../repo/donations');
const visits = require('../repo/visits');
const common = require('../repo/common');
const { saveUpload, deleteUpload, UploadError } = require('../uploads');

// The signed-in orphanage account's own profile and needs (orphanage/ portal).
// Status, verification and payment confirmation stay admin-only.
const router = express.Router();
router.use(authenticateUser);

router.use(async (req, res, next) => {
  if (req.user.role !== 'volunteer') {
    return res.status(403).json({ error: 'Only orphanage accounts can use the portal.' });
  }
  const user = await db.one("SELECT * FROM users WHERE id = ? AND role = 'orphanage'", [req.user.id]);
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  req.account = user;
  req.orphanage = await orphanages.ensureForUser(user);
  next();
});

const PROFILE_FIELDS = [
  'name', 'location', 'registrationNumber', 'foundedYear', 'capacity', 'childrenCount', 'contactName', 'contactPhone',
  'contactEmail', 'story', 'storyLanguage', 'paymentProvider', 'paymentAccountName', 'paymentAccountNumber', 'termsAgreed',
];
const NUMBER_FIELDS = new Set(['foundedYear', 'childrenCount', 'capacity']);
const MAX_DOCUMENTS = 8;
const STORY_LANGUAGES = ['en', 'fr'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What the admin needs before a profile can be reviewed. 'required' ones block submission.
function checklistFor(o) {
  const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  return [
    { key: 'name', label: 'Orphanage name', required: true, done: filled(o.name) },
    { key: 'location', label: 'Location (city / region)', required: true, done: filled(o.location) },
    { key: 'registrationNumber', label: 'Official registration number', required: true, done: filled(o.registrationNumber) },
    { key: 'childrenCount', label: 'Number of children in care', required: true, done: Number(o.childrenCount) > 0 },
    { key: 'contactName', label: 'Contact person', required: true, done: filled(o.contactName) },
    { key: 'contactPhone', label: 'Contact phone', required: true, done: filled(o.contactPhone) },
    { key: 'story', label: 'Your story (what you do and who you care for)', required: true, done: filled(o.story) },
    { key: 'documents', label: 'At least one verification document (e.g. registration certificate)', required: true, done: o.documents.length > 0 },
    { key: 'termsAgreed', label: 'Agree to the terms', required: true, done: Boolean(o.termsAgreed) },
    { key: 'photoUrl', label: 'Profile photo', required: false, done: filled(o.photoUrl) },
    { key: 'paymentAccount', label: 'Payment account for donations', required: false, done: filled(o.paymentAccountNumber) },
  ];
}

function toProfile(o) {
  return {
    id: o.id,
    name: o.name,
    location: o.location,
    registrationNumber: o.registrationNumber,
    foundedYear: o.foundedYear,
    capacity: o.capacity,
    childrenCount: o.childrenCount,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    story: o.story,
    storyLanguage: o.storyLanguage,
    paymentProvider: o.paymentProvider,
    paymentAccountName: o.paymentAccountName,
    paymentAccountNumber: o.paymentAccountNumber,
    termsAgreed: o.termsAgreed,
    photoUrl: o.photoUrl,
    coverPhotoUrl: o.coverPhotoUrl,
    documents: o.documents.map((d) => ({ id: d.id, name: d.name, size: d.size })),
    status: o.status,
    infoRequestMessage: o.infoRequestMessage,
    rejectionReason: o.rejectionReason,
    checklist: checklistFor(o),
  };
}

function toNeed(n) {
  return { id: n.id, title: n.title, description: n.description, goal: n.goal, raised: n.raised, percent: n.percent, date: n.date };
}

const actorOf = (req) => ({ userId: req.account.id, email: req.account.email, isAdmin: false });

function parseGoal(value) {
  const goal = Number(value);
  return Number.isInteger(goal) && goal > 0 ? goal : null;
}

router.get('/', async (req, res) => {
  res.json({ orphanage: toProfile(req.orphanage), needs: (await needs.forOrphanage(req.orphanage.id)).map(toNeed) });
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const changes = {};

  for (const key of PROFILE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    let value = typeof body[key] === 'string' ? body[key].trim() : body[key];

    if (typeof value === 'string' && value.length > 4000) {
      return res.status(400).json({ error: 'One of the fields is too long.' });
    }
    if (NUMBER_FIELDS.has(key)) {
      value = value === '' || value === null ? null : Number(value);
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        return res.status(400).json({ error: 'Founded year, capacity and children in care must be whole numbers.' });
      }
      if (key === 'foundedYear' && value !== null && (value < 1800 || value > new Date().getFullYear())) {
        return res.status(400).json({ error: 'Please enter a valid founding year.' });
      }
    }
    if (key === 'name' && !value) {
      return res.status(400).json({ error: 'Orphanage name cannot be empty.' });
    }
    if (key === 'storyLanguage' && value && !STORY_LANGUAGES.includes(value)) {
      return res.status(400).json({ error: 'Story language must be English or French.' });
    }
    if (key === 'contactEmail' && value && !EMAIL_PATTERN.test(value)) {
      return res.status(400).json({ error: 'Please enter a valid contact email address.' });
    }
    if (key === 'location' && typeof value === 'string' && value.length > 150) {
      return res.status(400).json({ error: 'The location is too long (150 characters at most).' });
    }
    if (key === 'termsAgreed') value = Boolean(value);

    changes[key] = value === '' ? null : value;
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  changes.activityLog = req.orphanage.activityLog.concat([
    { action: 'Profile updated by orphanage', reviewer: req.orphanage.contactEmail, timestamp: new Date().toISOString() },
  ]);
  const updated = await orphanages.save(req.orphanage.id, changes, actorOf(req));
  res.json({ orphanage: toProfile(updated) });
});

// --- documents and photos -------------------------------------------------

function handleUploadError(err, res) {
  if (err instanceof UploadError) return res.status(400).json({ error: err.message });
  throw err;
}

router.post('/documents', async (req, res) => {
  if (req.orphanage.documents.length >= MAX_DOCUMENTS) {
    return res.status(400).json({ error: 'You can upload up to ' + MAX_DOCUMENTS + ' documents. Remove one first.' });
  }
  try {
    const file = await saveUpload({ ownerUserId: req.account.id, purpose: 'document', filename: req.body && req.body.filename, data: req.body && req.body.data });
    await orphanages.attachDocument(req.orphanage.id, file.id);
    await common.logActivity('orphanage', req.orphanage.id, 'Uploaded document: ' + file.name, req.orphanage.contactEmail, req.account.id);
    res.status(201).json({ orphanage: toProfile(await orphanages.get(req.orphanage.id)) });
  } catch (err) {
    handleUploadError(err, res);
  }
});

router.delete('/documents/:id', async (req, res) => {
  const doc = req.orphanage.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });

  await deleteUpload(doc.id);
  await common.logActivity('orphanage', req.orphanage.id, 'Removed document: ' + doc.name, req.orphanage.contactEmail, req.account.id);
  res.json({ orphanage: toProfile(await orphanages.get(req.orphanage.id)) });
});

function photoRoute(column, urlKey, label) {
  return async (req, res) => {
    try {
      const file = await saveUpload({ ownerUserId: req.account.id, purpose: 'photo', filename: req.body && req.body.filename, data: req.body && req.body.data });
      const oldId = common.uploadIdFromUrl(req.orphanage[urlKey]);
      await orphanages.setPhoto(req.orphanage.id, column, file.id);
      await common.logActivity('orphanage', req.orphanage.id, 'Updated ' + label, req.orphanage.contactEmail, req.account.id);
      if (oldId) await deleteUpload(oldId);
      res.status(201).json({ orphanage: toProfile(await orphanages.get(req.orphanage.id)) });
    } catch (err) {
      handleUploadError(err, res);
    }
  };
}

router.post('/photo', photoRoute('profile_photo_upload_id', 'photoUrl', 'profile photo'));
router.post('/cover', photoRoute('cover_photo_upload_id', 'coverPhotoUrl', 'cover photo'));

// --- submit for verification ----------------------------------------------

router.post('/submit', async (req, res) => {
  const status = req.orphanage.status;
  if (status === 'pending') return res.status(400).json({ error: 'Your profile is already waiting for review.' });
  if (status === 'verified') return res.status(400).json({ error: 'Your profile is already verified.' });
  if (status === 'rejected') return res.status(400).json({ error: 'This profile was not approved. Please contact the CAM Orphanage Connect team.' });

  const missing = checklistFor(req.orphanage).filter((item) => item.required && !item.done);
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Please complete these first: ' + missing.map((m) => m.label).join('; ') + '.',
      missing: missing.map((m) => m.key),
    });
  }

  await orphanages.markSubmitted(req.orphanage.id, status, req.orphanage.contactEmail, req.account.id);
  res.json({ orphanage: toProfile(await orphanages.get(req.orphanage.id)) });
});

router.post('/needs', async (req, res) => {
  const { title, description, goal } = req.body || {};
  const goalAmount = parseGoal(goal);

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Please give the need a title.' });
  }
  if (!goalAmount) {
    return res.status(400).json({ error: 'Goal amount must be a positive whole number.' });
  }

  const need = await needs.create({ orphanageId: req.orphanage.id, title, description, goal: goalAmount });
  res.status(201).json({ need: toNeed(need) });
});

async function findOwnNeed(req, res) {
  const need = await needs.get(Number(req.params.id));
  if (!need || need.orphanageId !== req.orphanage.id) {
    res.status(404).json({ error: 'Need not found.' });
    return null;
  }
  return need;
}

router.put('/needs/:id', async (req, res) => {
  const need = await findOwnNeed(req, res);
  if (!need) return;

  const { title, description, goal } = req.body || {};
  const goalAmount = parseGoal(goal);

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Please give the need a title.' });
  }
  if (!goalAmount || goalAmount < need.raised) {
    return res.status(400).json({ error: 'Goal must be a positive whole number and not below what is already raised.' });
  }

  res.json({ need: toNeed(await needs.update(need.id, { title, description, goal: goalAmount })) });
});

router.delete('/needs/:id', async (req, res) => {
  const need = await findOwnNeed(req, res);
  if (!need) return;

  if (need.raised > 0) {
    return res.status(400).json({ error: 'This need has already received donations and cannot be removed.' });
  }

  await needs.remove(need.id);
  res.status(204).end();
});

// --- visit requests ----------------------------------------------------------

router.get('/visits', async (req, res) => {
  res.json({ visits: await visits.forOrphanage(req.orphanage.id) });
});

router.post('/visits/:id/respond', async (req, res) => {
  if (req.orphanage.status !== 'verified') {
    return res.status(403).json({ error: 'You can answer visit requests once your orphanage is verified.' });
  }
  const { decision, note } = req.body || {};
  await visits.respond(Number(req.params.id), req.orphanage.id, decision, note);
  res.json({ visits: await visits.forOrphanage(req.orphanage.id) });
});

router.get('/pledges', async (req, res) => {
  const pledges = await donations.pledgesToOrphanage(req.orphanage.id);
  res.json({
    pledges: pledges.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      donorName: p.is_anonymous ? 'Anonymous' : p.display_name,
      needTitle: p.need_title,
      createdAt: db.isoTime(p.created_at),
    })),
  });
});

module.exports = router;
