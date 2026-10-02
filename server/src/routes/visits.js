const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const { authenticate } = require('../middleware/auth');
const { memberActor } = require('../middleware/memberActor');
const orphanages = require('../repo/orphanages');
const visits = require('../repo/visits');
const notify = require('../notify');

// Visit requests, for approved donors and verified partners (the orphanage answers them from
// its own portal, see my-orphanage.js). Admins can read them all.
const member = express.Router();
member.use(memberActor);

// Only people the platform has approved may ask to visit a children's home.
function requireApproved(req, res, next) {
  const actor = req.actor;
  if (actor.side === 'orphanage') {
    return res.status(403).json({ error: 'Orphanage accounts cannot request visits.' });
  }
  if (actor.side === 'donor' && !actor.access.ok) {
    return res.status(403).json({ code: actor.access.code, error: 'Visits can be requested once the CAM Orphanage Connect team has approved your donor account.' });
  }
  if (actor.side === 'partner' && actor.partner.verificationStatus !== 'verified') {
    return res.status(403).json({ code: 'not-verified', error: 'Visits can be requested once the CAM Orphanage Connect team has verified your organization.' });
  }
  next();
}

member.get('/mine', async (req, res) => {
  if (req.actor.side === 'orphanage') return res.json({ visits: [] });
  res.json({ visits: await visits.forRequester(req.actor.userId) });
});

member.post('/', requireApproved, async (req, res) => {
  const body = req.body || {};
  const orphanage = await orphanages.getListed(Number(body.orphanageId) || 0);
  if (!orphanage) throw new HttpError(404, 'This orphanage is not available.');

  const visitId = await visits.create({
    userId: req.actor.userId,
    orphanageId: orphanage.id,
    preferredDate: body.preferredDate,
    visitorsCount: body.visitorsCount,
    message: body.message,
  });
  notify.visitRequested(visitId);
  res.status(201).json({ visits: await visits.forRequester(req.actor.userId) });
});

member.post('/:id/cancel', requireApproved, async (req, res) => {
  await visits.cancel(Number(req.params.id), req.actor.userId);
  res.json({ visits: await visits.forRequester(req.actor.userId) });
});

const admin = express.Router();
admin.use(authenticate);
admin.get('/', async (req, res) => {
  res.json({ visits: await visits.all() });
});

module.exports = { member, admin };
