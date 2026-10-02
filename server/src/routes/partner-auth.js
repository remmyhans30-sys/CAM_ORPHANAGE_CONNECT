const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticatePartner } = require('../middleware/partnerAuth');
const partners = require('../repo/partners');
const orphanages = require('../repo/orphanages');
const needs = require('../repo/needs');
const profiles = require('../repo/profiles');
const donations = require('../repo/donations');
const support = require('../repo/support');
const common = require('../repo/common');
const { saveUpload, deleteUpload, UploadError } = require('../uploads');
const chat = require('../chat');
const loginGuard = require('../loginGuard');

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORG_TYPES = ['NGO', 'Corporate', 'Diaspora Association', 'Foundation', 'Faith group', 'Other'];
const MAX_DOCUMENTS = 8;

const actorOf = (partner) => ({ userId: partner.ownerUserId, email: partner.email, isAdmin: false });
const reviewerOf = (partner) => partner.name + ' (partner self-service)';

function issueToken(partner) {
  return jwt.sign({ type: 'partner', id: partner.id, uid: partner.ownerUserId, email: partner.email }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

// What the admin needs before a partner can be reviewed. 'required' ones block submission.
function checklistFor(p) {
  const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  return [
    { key: 'name', label: 'Organization name', required: true, done: filled(p.name) },
    { key: 'orgType', label: 'Type of organization', required: true, done: filled(p.orgType) },
    { key: 'country', label: 'Country', required: true, done: filled(p.country) },
    { key: 'contactName', label: 'Contact person', required: true, done: filled(p.contactName) },
    { key: 'documents', label: 'At least one verification document (registration certificate, tax clearance or the contact person\'s ID)', required: true, done: p.documents.length > 0 },
    { key: 'termsAgreed', label: 'Agree to the terms', required: true, done: Boolean(p.termsAgreed) },
    { key: 'logoUrl', label: 'Organization logo', required: false, done: filled(p.logoUrl) },
    { key: 'sponsoredByBlurb', label: 'Short "Sponsored by" message for the public page', required: false, done: filled(p.sponsoredByBlurb) },
    { key: 'pledge', label: 'Matching pledge you propose', required: false, done: Boolean(p.pledge) },
  ];
}

function partnerProfile(p) {
  return { ...p, documents: p.documents.map((d) => ({ id: d.id, name: d.name, size: d.size })), checklist: checklistFor(p) };
}

// Orphanage details, donations to orphanages and placement cases are only for partners an
// admin has verified. (Profile, documents and messages with the team stay open.)
async function requireVerified(req, res, next) {
  const row = await db.one('SELECT verification_status FROM partner_organizations WHERE id = ?', [req.partner.id]);
  if (!row) return res.status(404).json({ error: 'Partner account no longer exists.' });
  if (row.verification_status !== 'verified') {
    return res.status(403).json({
      code: 'not-verified',
      status: partners.STATUS_OUT[row.verification_status],
      error: 'Browsing orphanages is available once the CAM Orphanage Connect team has verified your organization.',
    });
  }
  next();
}

// Loads the signed-in partner for the routes that need the whole record.
async function loadPartner(req, res, next) {
  const partner = await partners.get(req.partner.id);
  if (!partner) return res.status(404).json({ error: 'Partner account no longer exists.' });
  req.me = partner;
  next();
}

router.post('/register', async (req, res) => {
  const { name, email, password, acceptTerms } = req.body || {};

  if (!name || !name.trim() || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (acceptTerms !== true) {
    return res.status(400).json({ error: 'Please confirm that you are 18 or older and agree to the terms of use.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (await db.one('SELECT id FROM users WHERE email = ?', [normalizedEmail])) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const id = await partners.register({ name: name.trim(), email: normalizedEmail, passwordHash: bcrypt.hashSync(password, 10) });
  const partner = await partners.get(id);
  await common.logActivity('partner', id, 'Confirmed being 18 or older and agreed to the terms of use (version 2)', reviewerOf(partner), partner.ownerUserId);
  res.status(201).json({ token: issueToken(partner), partner: partnerProfile(partner) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  loginGuard.check('partner', email, req.ip);
  const user = await db.one("SELECT * FROM users WHERE email = ? AND role = 'partner' AND status = 'active'", [String(email).trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    loginGuard.fail('partner', email, req.ip);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const partner = await partners.getByOwner(user.id);
  if (!partner) return res.status(401).json({ error: 'Invalid email or password.' });
  loginGuard.succeed(email, req.ip);

  await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [db.sqlTime(), user.id]);
  res.json({ token: issueToken(partner), partner: partnerProfile(partner) });
});

router.get('/me', authenticatePartner, loadPartner, (req, res) => {
  res.json({ partner: partnerProfile(req.me) });
});

router.put('/me', authenticatePartner, loadPartner, async (req, res) => {
  const existing = req.me;
  const body = req.body || {};
  const changes = {};
  const text = (key, max) => {
    if (body[key] === undefined) return null;
    const value = String(body[key] || '').trim();
    if (value.length > max) return 'One of the fields is too long.';
    changes[key] = value || null;
    return null;
  };

  const problems = [text('name', 150), text('contactName', 120), text('country', 100), text('sponsoredByBlurb', 400)].filter(Boolean);
  if (problems.length > 0) return res.status(400).json({ error: problems[0] });

  if (body.name !== undefined && changes.name === null) return res.status(400).json({ error: 'Organization name cannot be empty.' });
  if (body.orgType !== undefined) {
    const orgType = String(body.orgType || '');
    if (orgType && !ORG_TYPES.includes(orgType)) return res.status(400).json({ error: 'Please choose one of the listed organization types.' });
    changes.orgType = orgType || null;
  }
  if (body.termsAgreed !== undefined) changes.termsAgreed = Boolean(body.termsAgreed);

  // A matching pledge is a proposal until the admin approves it, so it can't be changed once verified.
  if (body.pledgeDescription !== undefined || body.pledgeLimit !== undefined) {
    if (existing.verificationStatus === 'verified') {
      return res.status(400).json({ error: 'Your matching pledge is already approved. Contact the CAM Orphanage Connect team to change it.' });
    }
    const description = String(body.pledgeDescription || '').trim();
    const limit = Number(body.pledgeLimit);
    if (!description && !body.pledgeLimit) {
      changes.pledge = null;
    } else {
      if (!description || description.length > 400) return res.status(400).json({ error: 'Please describe your matching pledge (up to 400 characters).' });
      if (!Number.isInteger(limit) || limit <= 0) return res.status(400).json({ error: 'The pledge limit must be a positive whole number.' });
      changes.pledge = { description: description, limit: limit, used: existing.pledge ? existing.pledge.used : 0 };
    }
  }
  if (changes.sponsoredByBlurb !== undefined && changes.sponsoredByBlurb !== existing.sponsoredByBlurb) {
    changes.wordingApproved = false;
  }

  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  await common.logActivity('partner', existing.id, 'Updated organization profile', reviewerOf(existing), existing.ownerUserId);
  res.json({ partner: partnerProfile(await partners.save(existing.id, changes, actorOf(existing))) });
});

// --- documents, logo and submit for verification ---------------------------

function uploadFailure(err, res) {
  if (err instanceof UploadError) return res.status(400).json({ error: err.message });
  throw err;
}

router.post('/me/documents', authenticatePartner, loadPartner, async (req, res) => {
  const partner = req.me;
  if (partner.documents.length >= MAX_DOCUMENTS) {
    return res.status(400).json({ error: 'You can upload up to ' + MAX_DOCUMENTS + ' documents. Remove one first.' });
  }
  try {
    const file = await saveUpload({ ownerUserId: partner.ownerUserId, purpose: 'document', filename: req.body && req.body.filename, data: req.body && req.body.data });
    await partners.attachDocument(partner.id, file.id);
    await common.logActivity('partner', partner.id, 'Uploaded document: ' + file.name, reviewerOf(partner), partner.ownerUserId);
    res.status(201).json({ partner: partnerProfile(await partners.get(partner.id)) });
  } catch (err) {
    uploadFailure(err, res);
  }
});

router.delete('/me/documents/:id', authenticatePartner, loadPartner, async (req, res) => {
  const partner = req.me;
  const doc = partner.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });

  await deleteUpload(doc.id);
  await common.logActivity('partner', partner.id, 'Removed document: ' + doc.name, reviewerOf(partner), partner.ownerUserId);
  res.json({ partner: partnerProfile(await partners.get(partner.id)) });
});

router.post('/me/logo', authenticatePartner, loadPartner, async (req, res) => {
  const partner = req.me;
  try {
    const file = await saveUpload({ ownerUserId: partner.ownerUserId, purpose: 'photo', filename: req.body && req.body.filename, data: req.body && req.body.data });
    const oldId = common.uploadIdFromUrl(partner.logoUrl);
    await db.run('UPDATE partner_organizations SET logo_upload_id = ?, blurb_approved = 0 WHERE id = ?', [file.id, partner.id]);
    await common.logActivity('partner', partner.id, 'Updated organization logo', reviewerOf(partner), partner.ownerUserId);
    if (oldId) await deleteUpload(oldId);
    res.status(201).json({ partner: partnerProfile(await partners.get(partner.id)) });
  } catch (err) {
    uploadFailure(err, res);
  }
});

router.post('/me/submit', authenticatePartner, loadPartner, async (req, res) => {
  const partner = req.me;

  const status = partner.verificationStatus;
  if (status === 'pending') return res.status(400).json({ error: 'Your organization is already waiting for review.' });
  if (status === 'verified') return res.status(400).json({ error: 'Your organization is already verified.' });
  if (status === 'rejected') return res.status(400).json({ error: 'This application was not approved. Please contact the CAM Orphanage Connect team.' });

  const missing = checklistFor(partner).filter((item) => item.required && !item.done);
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Please complete these first: ' + missing.map((m) => m.label).join('; ') + '.',
      missing: missing.map((m) => m.key),
    });
  }

  await partners.submit(partner, partner.name);
  res.json({ partner: partnerProfile(await partners.get(partner.id)) });
});

router.post('/change-password', authenticatePartner, loadPartner, async (req, res) => {
  const partner = req.me;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  const user = await db.one('SELECT password_hash FROM users WHERE id = ?', [partner.ownerUserId]);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), partner.ownerUserId]);
  await common.logActivity('partner', partner.id, 'Changed partner portal password', reviewerOf(partner), partner.ownerUserId);
  res.json({ success: true });
});

function toPublicOrphanage(o) {
  return {
    id: o.id,
    name: o.name,
    location: o.location,
    story: o.story,
    childrenCount: o.childrenCount,
    capacity: o.capacity,
    foundedYear: o.foundedYear,
    followersCount: o.followersCount,
    photoUrl: o.photoUrl,
    coverPhotoUrl: o.coverPhotoUrl,
    gallery: o.gallery,
    socialLinks: o.socialLinks,
  };
}

router.get('/orphanages', authenticatePartner, requireVerified, async (req, res) => {
  const homes = await orphanages.listed();
  const result = [];
  for (const home of homes) {
    const list = await needs.forOrphanage(home.id);
    const orphanage = toPublicOrphanage(home);
    orphanage.needsCount = list.filter((n) => n.status === 'open' && n.raised < n.goal).length;
    orphanage.totalRaised = list.reduce((sum, n) => sum + n.raised, 0);
    result.push(orphanage);
  }
  res.json({ orphanages: result });
});

// One home's full profile (partner/orphanage-view.html), the same as donors see.
router.get('/orphanages/:id', authenticatePartner, requireVerified, async (req, res) => {
  const profile = await profiles.forSupporters(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json(profile);
});

router.get('/orphanages/:id/updates', authenticatePartner, requireVerified, async (req, res) => {
  const updates = await profiles.updatesFor(req.params.id);
  if (!updates) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json(updates);
});

// ---- the conversation with the CAM team ---------------------------------------

function toTeamThread(conv) {
  return {
    id: conv.id,
    senderName: conv.senderName,
    accountType: conv.accountType,
    accountId: conv.accountId,
    subject: conv.subject,
    body: conv.body,
    timestamp: conv.timestamp,
    fromAdmin: conv.fromAdmin,
    replies: conv.replies,
  };
}

router.get('/messages', authenticatePartner, loadPartner, async (req, res) => {
  const conv = await support.forUser(req.me.ownerUserId);
  if (conv) await support.markSeenByMember(conv.id, req.me.ownerUserId);
  res.json({ message: conv ? toTeamThread(conv) : null });
});

router.get('/messages/unread', authenticatePartner, loadPartner, async (req, res) => {
  const conv = await support.forUser(req.me.ownerUserId);
  const teamUnread = conv ? await support.unreadForMember(conv.id, req.me.ownerUserId) : false;
  const threads = await chat.threadsOf(req.me.ownerUserId);
  const chatsUnread = threads.filter((t) => chat.isUnread(t, 'partner')).length;
  res.json({ hasUnread: teamUnread || chatsUnread > 0, teamUnread: teamUnread, chatsUnread: chatsUnread });
});

// The partner's direct chats with orphanages (open one from its orphanage page).
router.get('/chats', authenticatePartner, loadPartner, async (req, res) => {
  const threads = await chat.threadsOf(req.me.ownerUserId);
  const conversations = threads
    .filter((t) => t.messages.length > 0)
    .map((t) => {
      const view = chat.viewFor(t, 'partner');
      delete view.messages;
      view.orphanageId = t.orphanage.id;
      return view;
    })
    .sort((x, y) => new Date(y.lastAt) - new Date(x.lastAt));
  res.json({ conversations: conversations });
});

router.post('/messages/reply', authenticatePartner, loadPartner, async (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });
  if (text.length > chat.MAX_TEXT) return res.status(400).json({ error: 'That message is too long. The limit is ' + chat.MAX_TEXT + ' characters.' });

  const before = await support.forUser(req.me.ownerUserId);
  const conv = await support.memberSends(req.me.ownerUserId, text);
  res.status(!before || before.messages.length === 0 ? 201 : 200).json({ message: toTeamThread(conv) });
});

// ---- gifts and placement cases ---------------------------------------------------

router.post('/donations', authenticatePartner, requireVerified, loadPartner, async (req, res) => {
  const partner = req.me;
  const body = req.body || {};
  const type = body.type === 'item' ? 'item' : 'money';
  const orphanage = await orphanages.getListed(Number(body.orphanageId) || 0);
  if (!orphanage) return res.status(400).json({ error: 'Please select a valid orphanage.' });

  const date = body.date || new Date().toISOString().slice(0, 10);
  const needTitle = (body.need || '').trim();
  const value = Number(body.amount) || 0;
  const itemDescription = (body.itemDescription || '').trim();

  if (type === 'item' && !itemDescription) return res.status(400).json({ error: 'Please describe what was donated.' });
  if (type === 'money' && value <= 0) return res.status(400).json({ error: 'Please enter a donation amount.' });

  const need = needTitle ? (await needs.forOrphanage(orphanage.id)).find((n) => n.title === needTitle) : null;

  await db.tx(async () => {
    await donations.create({
      giverUserId: partner.ownerUserId, orphanageId: orphanage.id, needId: need ? need.id : null, type,
      amount: value, itemDescription, quantity: (body.quantity || '').trim(), deliveryMethod: (body.deliveryMethod || '').trim(),
      method: (body.method || '').trim(), status: 'completed', date,
    });
    await partners.noteSponsorship(partner.id, orphanage.id, date);
    await common.logActivity('partner', partner.id, 'Logged a ' + type + ' donation to ' + orphanage.name, reviewerOf(partner), partner.ownerUserId);
  });

  res.status(201).json({ partner: await partners.get(partner.id) });
});

router.post('/placement-cases', authenticatePartner, requireVerified, loadPartner, async (req, res) => {
  const partner = req.me;
  if (partner.tier !== 'Verified Referrer') {
    return res.status(403).json({ error: 'Only Verified Referrer partners can submit placement cases.' });
  }

  const body = req.body || {};
  const socialWorkerName = (body.socialWorkerName || '').trim();
  const reasonForReferral = (body.reasonForReferral || '').trim();
  if (!socialWorkerName || !reasonForReferral) {
    return res.status(400).json({ error: 'Social worker name and reason for referral are required.' });
  }

  await partners.addPlacementCase(partner.id, {
    socialWorkerName, reasonForReferral,
    socialWorkerPhone: (body.socialWorkerPhone || '').trim(),
    placementType: (body.placementType || '').trim(),
    educationalStatus: (body.educationalStatus || '').trim(),
    livingEnvironmentNotes: (body.livingEnvironmentNotes || '').trim(),
    anticipatedDischargeDate: (body.anticipatedDischargeDate || '').trim(),
  });
  await common.logActivity('partner', partner.id, 'Submitted a new placement referral case', reviewerOf(partner), partner.ownerUserId);

  res.status(201).json({ partner: await partners.get(partner.id) });
});

router.post('/orphanages/:id/favorite', authenticatePartner, requireVerified, loadPartner, async (req, res) => {
  const orphanage = await orphanages.getListed(Number(req.params.id) || 0);
  if (!orphanage) return res.status(404).json({ error: 'Orphanage not found.' });

  await partners.toggleFavourite(req.me.ownerUserId, orphanage.id);
  res.json({ partner: await partners.get(req.me.id) });
});

// ---- the partner's chat with one orphanage -----------------------------------------

function toThread(thread, partnerId) {
  return {
    id: thread.id,
    partnerId: partnerId,
    orphanageId: thread.orphanage.id,
    messages: thread.messages.map((m) => ({ text: m.text, timestamp: m.timestamp, sender: m.sender })),
    updatedAt: thread.updatedAt,
  };
}

async function existingThread(partnerUserId, orphanageUserId) {
  const low = Math.min(partnerUserId, orphanageUserId);
  const high = Math.max(partnerUserId, orphanageUserId);
  const row = await db.one("SELECT id FROM conversations WHERE kind = 'direct' AND user_low_id = ? AND user_high_id = ?", [low, high]);
  return row ? chat.threadById(row.id) : null;
}

router.get('/orphanages/:id/messages', authenticatePartner, requireVerified, loadPartner, async (req, res) => {
  const orphanage = await orphanages.get(Number(req.params.id));
  const thread = orphanage ? await existingThread(req.me.ownerUserId, orphanage.ownerUserId) : null;
  if (thread) await chat.markSeen(thread, 'partner');
  res.json({ thread: thread ? toThread(await chat.threadById(thread.id), req.me.id) : null, orphanageName: orphanage ? orphanage.name : null });
});

router.post('/orphanages/:id/messages', authenticatePartner, requireVerified, loadPartner, async (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });
  if (text.length > chat.MAX_TEXT) return res.status(400).json({ error: 'That message is too long. The limit is ' + chat.MAX_TEXT + ' characters.' });
  try {
    chat.checkRate('partner-' + req.me.id);
  } catch (err) {
    return res.status(429).json({ error: err.message });
  }

  const orphanage = await orphanages.getVerified(Number(req.params.id));
  if (!orphanage) return res.status(404).json({ error: 'Orphanage not found.' });

  let thread = await chat.findOrCreateThread(orphanage.ownerUserId, req.me.ownerUserId);
  thread = await chat.appendMessage(thread, 'partner', text);
  await chat.markSeen(thread, 'partner');
  res.status(201).json({ thread: toThread(thread, req.me.id) });
});

module.exports = router;
