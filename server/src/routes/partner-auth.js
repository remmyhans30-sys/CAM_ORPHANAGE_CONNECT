const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticatePartner } = require('../middleware/partnerAuth');
const { rowToPartner } = require('./partners');

const router = express.Router();

function appendActivityLog(row, action) {
  const activityLog = JSON.parse(row.activity_log || '[]');
  activityLog.push({ reviewer: row.name + ' (partner self-service)', action: action, timestamp: new Date().toISOString() });
  db.prepare("UPDATE partners SET activity_log = ? WHERE id = ?").run(JSON.stringify(activityLog), row.id);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const partner = db.prepare('SELECT * FROM partners WHERE email = ?').get(email.trim().toLowerCase());
  if (!partner || !partner.password_hash) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const passwordMatches = bcrypt.compareSync(password, partner.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { type: 'partner', id: partner.id, email: partner.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, partner: rowToPartner(partner) });
});

router.get('/me', authenticatePartner, (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!row) {
    return res.status(404).json({ error: 'Partner account no longer exists.' });
  }
  res.json({ partner: rowToPartner(row) });
});

router.put('/me', authenticatePartner, (req, res) => {
  const existing = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!existing) return res.status(404).json({ error: 'Partner account no longer exists.' });

  const { contactName, country } = req.body || {};
  const updates = {};
  if (contactName !== undefined) updates.contact_name = contactName.trim();
  if (country !== undefined) updates.country = country.trim();

  const keys = Object.keys(updates);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE partners SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => updates[k]), req.partner.id);
    appendActivityLog(existing, 'Self-updated contact details');
  }

  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  res.json({ partner: rowToPartner(row) });
});

router.post('/change-password', authenticatePartner, (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!row) return res.status(404).json({ error: 'Partner account no longer exists.' });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (!row.password_hash || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE partners SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, req.partner.id);
  appendActivityLog(row, 'Changed partner portal password');
  res.json({ success: true });
});

function rowToPublicOrphanage(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    story: row.story,
    childrenCount: row.children_count,
    capacity: row.capacity,
    foundedYear: row.founded_year,
    followersCount: row.followers_count,
    photoUrl: row.photo_url,
    coverPhotoUrl: row.cover_photo_url,
    gallery: JSON.parse(row.gallery),
    posts: JSON.parse(row.posts),
  };
}

function rowToPublicNeed(row) {
  return { id: row.id, title: row.title, goal: row.goal, raised: row.raised, percent: row.percent, date: row.date };
}

router.get('/orphanages', authenticatePartner, (req, res) => {
  const rows = db.prepare("SELECT * FROM orphanages WHERE status = 'verified' ORDER BY name ASC").all();
  const orphanages = rows.map((row) => {
    const orphanage = rowToPublicOrphanage(row);
    const needs = db.prepare('SELECT raised FROM needs WHERE orphanage_id = ?').all(row.id);
    orphanage.needsCount = needs.length;
    orphanage.totalRaised = needs.reduce((sum, n) => sum + Number(n.raised || 0), 0);
    return orphanage;
  });
  res.json({ orphanages: orphanages });
});

router.get('/orphanages/:id', authenticatePartner, (req, res) => {
  const row = db.prepare("SELECT * FROM orphanages WHERE id = ? AND status = 'verified'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Orphanage not found.' });

  const needs = db.prepare('SELECT * FROM needs WHERE orphanage_id = ? ORDER BY id DESC').all(req.params.id).map(rowToPublicNeed);
  res.json({ orphanage: rowToPublicOrphanage(row), needs: needs });
});

function rowToThread(row) {
  return {
    id: row.id,
    senderName: row.sender_name,
    accountType: row.account_type,
    accountId: row.account_id,
    subject: row.subject,
    body: row.body,
    timestamp: row.timestamp,
    fromAdmin: Boolean(row.from_admin),
    replies: JSON.parse(row.replies),
  };
}

router.get('/messages', authenticatePartner, (req, res) => {
  const row = db.prepare("SELECT * FROM messages WHERE account_type = 'partner' AND account_id = ?").get(req.partner.id);
  if (row) {
    db.prepare('UPDATE messages SET partner_last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  }
  res.json({ message: row ? rowToThread(row) : null });
});

function lastAdminActivityAt(row) {
  const timestamps = [];
  if (row.from_admin && row.body) timestamps.push(row.timestamp);
  JSON.parse(row.replies || '[]').forEach((r) => {
    if (r.sender !== 'partner') timestamps.push(r.timestamp);
  });
  if (timestamps.length === 0) return null;
  return timestamps.reduce((latest, t) => (new Date(t) > new Date(latest) ? t : latest));
}

router.get('/messages/unread', authenticatePartner, (req, res) => {
  const row = db.prepare("SELECT * FROM messages WHERE account_type = 'partner' AND account_id = ?").get(req.partner.id);
  if (!row) return res.json({ hasUnread: false });

  const lastActivity = lastAdminActivityAt(row);
  const hasUnread = Boolean(lastActivity) && (!row.partner_last_seen_at || new Date(lastActivity) > new Date(row.partner_last_seen_at));
  res.json({ hasUnread: hasUnread });
});

router.post('/messages/reply', authenticatePartner, (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });

  let row = db.prepare("SELECT * FROM messages WHERE account_type = 'partner' AND account_id = ?").get(req.partner.id);

  if (!row) {
    const partnerRow = db.prepare('SELECT name FROM partners WHERE id = ?').get(req.partner.id);
    const result = db.prepare(
      'INSERT INTO messages (sender_name, account_type, account_id, subject, body, timestamp, read, from_admin, replies) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(partnerRow.name, 'partner', req.partner.id, 'Conversation with ' + partnerRow.name, text, new Date().toISOString(), 0, 0, '[]');
    row = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ message: rowToThread(row) });
  }

  const replies = JSON.parse(row.replies);
  replies.push({ text: text, timestamp: new Date().toISOString(), sender: 'partner' });
  db.prepare("UPDATE messages SET replies = ?, read = 0, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(replies), row.id);
  row = db.prepare('SELECT * FROM messages WHERE id = ?').get(row.id);
  res.json({ message: rowToThread(row) });
});

router.post('/donations', authenticatePartner, (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!row) return res.status(404).json({ error: 'Partner account no longer exists.' });

  const body = req.body || {};
  const type = body.type === 'item' ? 'item' : 'money';
  const orphanageRow = db.prepare("SELECT * FROM orphanages WHERE id = ? AND status = 'verified'").get(body.orphanageId);
  if (!orphanageRow) return res.status(400).json({ error: 'Please select a valid orphanage.' });

  const date = body.date || new Date().toISOString().slice(0, 10);
  const need = (body.need || '').trim();
  let donation;
  let estimatedValue;

  if (type === 'item') {
    const itemDescription = (body.itemDescription || '').trim();
    if (!itemDescription) return res.status(400).json({ error: 'Please describe what was donated.' });
    estimatedValue = Number(body.amount) || 0;
    donation = {
      type: 'item',
      orphanage: orphanageRow.name,
      orphanageId: orphanageRow.id,
      need: need,
      itemDescription: itemDescription,
      quantity: (body.quantity || '').trim(),
      amount: estimatedValue,
      deliveryMethod: (body.deliveryMethod || '').trim(),
      date: date,
      status: 'completed',
    };
  } else {
    estimatedValue = Number(body.amount) || 0;
    if (estimatedValue <= 0) return res.status(400).json({ error: 'Please enter a donation amount.' });
    donation = {
      type: 'money',
      orphanage: orphanageRow.name,
      orphanageId: orphanageRow.id,
      need: need,
      amount: estimatedValue,
      method: (body.method || '').trim(),
      date: date,
      status: 'completed',
    };
  }

  const donations = JSON.parse(row.donations || '[]');
  donations.push(donation);

  const orphanagesSponsored = JSON.parse(row.orphanages_sponsored || '[]');
  const existingHome = orphanagesSponsored.find((o) => o.name === orphanageRow.name);
  if (existingHome) {
    existingHome.amount = (existingHome.amount || 0) + estimatedValue;
  } else {
    orphanagesSponsored.push({ name: orphanageRow.name, sponsorSince: date, amount: estimatedValue });
  }

  const newTotal = (row.total_contributed || 0) + estimatedValue;

  db.prepare("UPDATE partners SET donations = ?, orphanages_sponsored = ?, total_contributed = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(donations), JSON.stringify(orphanagesSponsored), newTotal, req.partner.id);
  appendActivityLog(row, 'Logged a ' + type + ' donation to ' + orphanageRow.name);

  const updated = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  res.status(201).json({ partner: rowToPartner(updated) });
});

router.post('/placement-cases', authenticatePartner, (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!row) return res.status(404).json({ error: 'Partner account no longer exists.' });
  if (row.tier !== 'Verified Referrer') {
    return res.status(403).json({ error: 'Only Verified Referrer partners can submit placement cases.' });
  }

  const body = req.body || {};
  const socialWorkerName = (body.socialWorkerName || '').trim();
  const reasonForReferral = (body.reasonForReferral || '').trim();
  if (!socialWorkerName || !reasonForReferral) {
    return res.status(400).json({ error: 'Social worker name and reason for referral are required.' });
  }

  const placementCase = {
    submittedDate: new Date().toISOString().slice(0, 10),
    status: 'pending',
    socialWorkerName: socialWorkerName,
    socialWorkerPhone: (body.socialWorkerPhone || '').trim(),
    reasonForReferral: reasonForReferral,
    placementType: (body.placementType || '').trim(),
    educationalStatus: (body.educationalStatus || '').trim(),
    livingEnvironmentNotes: (body.livingEnvironmentNotes || '').trim(),
    anticipatedDischargeDate: (body.anticipatedDischargeDate || '').trim(),
  };

  const placementCases = JSON.parse(row.placement_cases || '[]');
  placementCases.push(placementCase);
  const newCount = (row.placement_referrals_count || 0) + 1;

  db.prepare("UPDATE partners SET placement_cases = ?, placement_referrals_count = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(placementCases), newCount, req.partner.id);
  appendActivityLog(row, 'Submitted a new placement referral case');

  const updated = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  res.status(201).json({ partner: rowToPartner(updated) });
});

router.post('/orphanages/:id/favorite', authenticatePartner, (req, res) => {
  const row = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  if (!row) return res.status(404).json({ error: 'Partner account no longer exists.' });

  const orphanageId = Number(req.params.id);
  const orphanageRow = db.prepare("SELECT id FROM orphanages WHERE id = ? AND status = 'verified'").get(orphanageId);
  if (!orphanageRow) return res.status(404).json({ error: 'Orphanage not found.' });

  const favorites = JSON.parse(row.favorite_orphanage_ids || '[]');
  const index = favorites.indexOf(orphanageId);
  if (index === -1) {
    favorites.push(orphanageId);
  } else {
    favorites.splice(index, 1);
  }

  db.prepare("UPDATE partners SET favorite_orphanage_ids = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(favorites), req.partner.id);

  const updated = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.id);
  res.json({ partner: rowToPartner(updated) });
});

function rowToPartnerOrphanageThread(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    orphanageId: row.orphanage_id,
    messages: JSON.parse(row.messages || '[]'),
    updatedAt: row.updated_at,
  };
}

router.get('/orphanages/:id/messages', authenticatePartner, (req, res) => {
  const orphanageId = Number(req.params.id);
  const row = db.prepare('SELECT * FROM partner_orphanage_threads WHERE partner_id = ? AND orphanage_id = ?').get(req.partner.id, orphanageId);
  res.json({ thread: row ? rowToPartnerOrphanageThread(row) : null });
});

router.post('/orphanages/:id/messages', authenticatePartner, (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });

  const orphanageId = Number(req.params.id);
  const orphanageRow = db.prepare("SELECT id FROM orphanages WHERE id = ? AND status = 'verified'").get(orphanageId);
  if (!orphanageRow) return res.status(404).json({ error: 'Orphanage not found.' });

  let row = db.prepare('SELECT * FROM partner_orphanage_threads WHERE partner_id = ? AND orphanage_id = ?').get(req.partner.id, orphanageId);
  const entry = { text: text, timestamp: new Date().toISOString(), sender: 'partner' };

  if (!row) {
    const result = db.prepare('INSERT INTO partner_orphanage_threads (partner_id, orphanage_id, messages) VALUES (?,?,?)')
      .run(req.partner.id, orphanageId, JSON.stringify([entry]));
    row = db.prepare('SELECT * FROM partner_orphanage_threads WHERE id = ?').get(result.lastInsertRowid);
  } else {
    const messages = JSON.parse(row.messages);
    messages.push(entry);
    db.prepare("UPDATE partner_orphanage_threads SET messages = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(messages), row.id);
    row = db.prepare('SELECT * FROM partner_orphanage_threads WHERE id = ?').get(row.id);
  }

  res.status(201).json({ thread: rowToPartnerOrphanageThread(row) });
});

module.exports = router;
