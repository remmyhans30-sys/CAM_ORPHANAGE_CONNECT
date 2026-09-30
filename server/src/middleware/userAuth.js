const jwt = require('jsonwebtoken');

// Donor/orphanage tokens use their own secret so they can never pass admin auth.
function userSecret() {
  return process.env.JWT_SECRET + ':users';
}

function authenticateUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token.' });
  }

  try {
    const payload = jwt.verify(token, userSecret());
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { authenticateUser, userSecret };
