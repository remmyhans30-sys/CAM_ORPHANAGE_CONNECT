const express = require('express');
const db = require('../db');
const { authenticateUser } = require('../middleware/userAuth');
const donors = require('../repo/donors');
const common = require('../repo/common');
const { saveUpload, deleteUpload, UploadError } = require('../uploads');

// The signed-in donor's own profile (donor/profile.html).
const router = express.Router();
router.use(authenticateUser);

router.use(async (req, res, next) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'Only donor accounts can use this page.' });
  }
  const user = await db.one("SELECT * FROM users WHERE id = ? AND role = 'donor'", [req.user.id]);
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  req.account = user;
  req.donor = await donors.ensureForUser(user);
  next();
});

const PAYMENT_METHODS = ['MTN Mobile Money', 'Orange Money', 'Card', 'Bank transfer'];
const CURRENCIES = ['XAF', 'EUR', 'USD'];

function toProfile(donor) {
  return {
    name: donor.name,
    email: donor.email,
    location: donor.location,
    preferredPayment: donor.preferredPayment,
    preferredCurrency: donor.preferredCurrency,
    referredBy: donor.referredBy,
    photoUrl: donor.photoUrl,
    joinDate: donor.joinDate,
    status: donor.status,
    statusReason: donor.status === 'rejected' || donor.status === 'flagged' ? donor.flagReason : null,
    needsEmailConfirmation: donor.needsEmailConfirmation,
    totalGiven: donor.totalGiven,
    donationsCount: donor.donationsCount,
  };
}

router.get('/', (req, res) => {
  res.json({ donor: toProfile(req.donor) });
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const changes = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Your name cannot be empty.' });
    if (name.length > 120) return res.status(400).json({ error: 'That name is too long.' });
    changes.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    const location = String(body.location || '').trim();
    if (location.length > 150) return res.status(400).json({ error: 'That location is too long.' });
    changes.location = location || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'preferredPayment')) {
    const method = String(body.preferredPayment || '');
    if (method && !PAYMENT_METHODS.includes(method)) return res.status(400).json({ error: 'Please choose one of the listed payment methods.' });
    changes.preferredPayment = method || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'preferredCurrency')) {
    const currency = String(body.preferredCurrency || '');
    if (currency && !CURRENCIES.includes(currency)) return res.status(400).json({ error: 'Please choose one of the listed currencies.' });
    changes.preferredCurrency = currency || 'XAF';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'referredBy')) {
    const referredBy = String(body.referredBy || '').trim();
    if (referredBy.length > 120) return res.status(400).json({ error: 'That text is too long.' });
    changes.referredBy = referredBy || null;
  }

  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  changes.activityLog = req.donor.activityLog.concat([
    { action: 'Profile updated by donor', reviewer: req.account.email, timestamp: new Date().toISOString() },
  ]);
  const donor = await donors.save(req.account.id, changes, { userId: req.account.id, email: req.account.email, isAdmin: false });
  res.json({ donor: toProfile(donor) });
});

router.post('/photo', async (req, res) => {
  try {
    const file = await saveUpload({ ownerUserId: req.account.id, purpose: 'photo', filename: req.body && req.body.filename, data: req.body && req.body.data });
    const oldId = common.uploadIdFromUrl(req.donor.photoUrl);
    await db.run('UPDATE donor_profiles SET photo_upload_id = ? WHERE user_id = ?', [file.id, req.account.id]);
    await common.logActivity('donor', req.account.id, 'Updated profile photo', req.account.email, req.account.id);
    if (oldId) await deleteUpload(oldId);
    res.status(201).json({ donor: toProfile(await donors.get(req.account.id)) });
  } catch (err) {
    if (err instanceof UploadError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

module.exports = router;
