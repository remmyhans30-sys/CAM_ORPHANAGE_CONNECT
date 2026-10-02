const express = require('express');
const db = require('../db');
const { authenticateUser } = require('../middleware/userAuth');
const donors = require('../repo/donors');
const needs = require('../repo/needs');
const donations = require('../repo/donations');

// Donor pledges: the amount is recorded and counted toward the need; no money is charged.
const router = express.Router();
router.use(authenticateUser);

const MIN_PLEDGE = 500;

router.post('/', async (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'Only donor accounts can make pledges.' });
  }

  const account = await db.one("SELECT * FROM users WHERE id = ? AND role = 'donor'", [req.user.id]);
  if (!account) {
    return res.status(401).json({ code: 'sign-in', error: 'Account no longer exists.' });
  }
  const access = await donors.accessFor(account);
  if (!access.ok) {
    return res.status(403).json({ code: access.code, error: access.error });
  }

  const { needId, amount, anonymous } = req.body || {};
  const pledgeAmount = Number(amount);
  if (!Number.isInteger(pledgeAmount) || pledgeAmount < MIN_PLEDGE) {
    return res.status(400).json({ error: 'Pledges start at ' + MIN_PLEDGE + ' XAF (whole amounts only).' });
  }

  // Only listed homes take pledges: verified, and not flagged for review by an admin.
  const need = await needs.get(Number(needId));
  const home = need ? await db.one('SELECT verification_status, is_flagged FROM orphanages WHERE id = ?', [need.orphanageId]) : null;
  if (!need || !home || home.verification_status !== 'verified' || home.is_flagged || need.status !== 'open' || need.goal <= 0) {
    return res.status(404).json({ error: 'This need is not available.' });
  }

  const remaining = need.goal - need.raised;
  if (remaining <= 0) {
    return res.status(400).json({ error: 'This need is already fully funded.' });
  }
  if (pledgeAmount > remaining) {
    return res.status(400).json({ error: 'Only ' + remaining.toLocaleString('en-US') + ' XAF is still needed for this need.' });
  }

  // The database checks the same rules again, so two pledges at the same moment cannot overfill a need.
  const pledgeId = await db.tx(async () => {
    const id = await donations.create({
      giverUserId: req.user.id, orphanageId: need.orphanageId, needId: need.id, type: 'money',
      amount: pledgeAmount, anonymous: Boolean(anonymous), status: 'pledged',
    });
    await db.run('UPDATE donor_profiles SET last_active_at = ? WHERE user_id = ?', [db.sqlTime(), req.user.id]);
    return id;
  });

  // The donor gives directly to the home: they get its confirmed account (or null while the team has
  // not confirmed one yet) and a reference to write in the payment note.
  const updated = await needs.get(need.id);
  const payTo = (await donations.confirmedAccounts([need.orphanageId])).get(need.orphanageId) || null;
  res.status(201).json({
    need: { id: updated.id, goal: updated.goal, raised: updated.raised, percent: updated.percent },
    pledge: { id: pledgeId, reference: donations.referenceOf(pledgeId), payTo: payTo },
  });
});

// The donor's pledges: whether the home has received each one, and where to send those it has not.
router.get('/mine', async (req, res) => {
  const rows = await donations.pledgesBy(req.user.id);
  const accounts = await donations.confirmedAccounts(Array.from(new Set(rows.map((r) => r.orphanage_id))));
  res.json({
    pledges: rows.map((r) => ({
      id: r.id,
      reference: donations.referenceOf(r.id),
      needId: r.need_id,
      needTitle: r.need_title,
      orphanageName: r.orphanage_name,
      amount: Number(r.amount),
      anonymous: Boolean(r.is_anonymous),
      createdAt: db.isoTime(r.created_at),
      received: r.status === 'completed',
      payTo: r.status === 'completed' ? null : (accounts.get(r.orphanage_id) || null),
    })),
  });
});

module.exports = router;
