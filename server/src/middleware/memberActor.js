const jwt = require('jsonwebtoken');
const db = require('../db');
const { userSecret } = require('./userAuth');
const orphanages = require('../repo/orphanages');
const partners = require('../repo/partners');
const donors = require('../repo/donors');

// Works out who is signed in when a route is open to donors, orphanages and partners alike.
// Partners have their own kind of login token; donors and orphanages share another.
// Sets req.actor = { side: 'donor' | 'orphanage' | 'partner', userId, id, name, ... }.
async function memberActor(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authentication token.' });

  let partnerPayload = null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === 'partner') partnerPayload = payload;
  } catch (err) {
    // not a partner token — try a donor/orphanage token below
  }

  if (partnerPayload) {
    const partner = await partners.get(partnerPayload.id);
    if (!partner) return res.status(401).json({ error: 'Account no longer exists.' });
    req.actor = { side: 'partner', accountType: 'partner', id: partner.id, userId: partner.ownerUserId, name: partner.name, partner: partner };
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, userSecret());
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  const user = await db.one("SELECT * FROM users WHERE id = ? AND role IN ('donor', 'orphanage')", [payload.id]);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });

  if (user.role === 'orphanage') {
    const orphanage = await orphanages.ensureForUser(user);
    req.actor = { side: 'orphanage', accountType: 'orphanage', id: orphanage.id, userId: user.id, name: orphanage.name, orphanage: orphanage };
  } else {
    const access = await donors.accessFor(user);
    req.actor = { side: 'donor', accountType: 'donor', id: user.id, userId: user.id, name: access.donor.name, donor: access.donor, access: access };
  }
  next();
}

module.exports = { memberActor };
