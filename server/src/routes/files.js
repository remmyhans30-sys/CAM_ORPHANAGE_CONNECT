const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { filePathFor } = require('../uploads');
const { userSecret } = require('../middleware/userAuth');

const router = express.Router();

const ID_PATTERN = /^[0-9a-f]{32}$/;

function sendUpload(res, upload) {
  res.setHeader('Content-Type', upload.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="' + upload.original_name.replace(/"/g, '') + '"');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.sendFile(filePathFor(upload), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found.' });
  });
}

// Photos and logos are public: they are shown on public profile cards.
router.get('/photo/:id', async (req, res) => {
  const upload = ID_PATTERN.test(req.params.id) && await db.one("SELECT * FROM uploads WHERE id = ? AND purpose = 'photo' AND deleted_at IS NULL", [req.params.id]);
  if (!upload) return res.status(404).json({ error: 'File not found.' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  sendUpload(res, upload);
});

// Who is asking? An admin may open any document; everyone else only their own.
function identify(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === 'admin') return { kind: 'admin' };
    if (payload.type === 'partner') return { kind: 'owner', userId: payload.uid };
  } catch (err) {
    // not an admin or partner token — try a user token below
  }
  try {
    const payload = jwt.verify(token, userSecret());
    return { kind: 'owner', userId: payload.id };
  } catch (err) {
    return null;
  }
}

router.get('/document/:id', async (req, res) => {
  const who = identify(req);
  if (!who) return res.status(401).json({ error: 'Please sign in to open this file.' });

  const upload = ID_PATTERN.test(req.params.id) && await db.one("SELECT * FROM uploads WHERE id = ? AND purpose = 'document' AND deleted_at IS NULL", [req.params.id]);
  if (!upload || (who.kind !== 'admin' && upload.owner_user_id !== who.userId)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  sendUpload(res, upload);
});

module.exports = router;
