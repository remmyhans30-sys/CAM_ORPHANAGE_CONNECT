const jwt = require('jsonwebtoken');
const db = require('../db');
const donors = require('../repo/donors');
const { userSecret } = require('./userAuth');

// Orphanage details are only for approved donors. The reason is sent as a `code` so the
// page can show the right message (sign in, waiting for approval, ...).
async function requireApprovedDonor(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: 'sign-in', error: 'Please sign in with a donor account to browse orphanages.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, userSecret());
  } catch (err) {
    return res.status(401).json({ code: 'sign-in', error: 'Your session has expired. Please sign in again.' });
  }
  if (payload.role !== 'user') {
    return res.status(403).json({ code: 'donors-only', error: 'Only approved donor accounts can browse orphanages here.' });
  }

  const user = await db.one("SELECT * FROM users WHERE id = ? AND role = 'donor'", [payload.id]);
  if (!user) {
    return res.status(401).json({ code: 'sign-in', error: 'Please sign in with a donor account to browse orphanages.' });
  }

  const access = await donors.accessFor(user);
  if (!access.ok) {
    return res.status(403).json({ code: access.code, error: access.error });
  }

  req.user = { id: user.id, email: user.email, role: payload.role };
  req.donor = access.donor;
  next();
}

module.exports = { requireApprovedDonor };
