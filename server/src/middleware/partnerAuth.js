const jwt = require('jsonwebtoken');

function authenticatePartner(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'partner') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.partner = { id: payload.id, email: payload.email, userId: payload.uid };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { authenticatePartner };
