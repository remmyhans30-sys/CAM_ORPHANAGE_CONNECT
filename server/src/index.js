require('dotenv').config();
require('express-async-errors');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env — copy .env.example to .env and set one before starting the server.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 random characters on the live site.');
  process.exit(1);
}

const db = require('./db');
const { HttpError, fromDatabase } = require('./errors');
const { ensureFirstAdmin } = require('./firstAdmin');

const authRoutes = require('./routes/auth');
const orphanageRoutes = require('./routes/orphanages');
const donorRoutes = require('./routes/donors');
const partnerRoutes = require('./routes/partners');
const programRoutes = require('./routes/programs');
const needRoutes = require('./routes/needs');
const messageRoutes = require('./routes/messages');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admins');
const settingsRoutes = require('./routes/settings');
const partnerAuthRoutes = require('./routes/partner-auth');
const partnerOrphanageMessageRoutes = require('./routes/partner-orphanage-messages');
const userRoutes = require('./routes/users');
const myOrphanageRoutes = require('./routes/my-orphanage');
const publicRoutes = require('./routes/public');
const pledgeRoutes = require('./routes/pledges');
const fileRoutes = require('./routes/files');
const myDonorRoutes = require('./routes/my-donor');
const myMessagesRoutes = require('./routes/my-messages');
const siteRoutes = require('./routes/site');
const visitRoutes = require('./routes/visits');
const adminConversationRoutes = require('./routes/admin-conversations');
const accountRoutes = require('./routes/account');

const app = express();
// Behind the host's proxy the real visitor address is in the forwarded header (used to slow down repeated requests).
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/orphanages', orphanageRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/needs', needRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/partner-auth', partnerAuthRoutes);
app.use('/api/partner-orphanage-messages', partnerOrphanageMessageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/my-orphanage', myOrphanageRoutes);
app.use('/api/browse', publicRoutes);
app.use('/api/pledges', pledgeRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/my-donor', myDonorRoutes);
app.use('/api/my-messages', myMessagesRoutes);
app.use('/api/site', siteRoutes);
app.use('/api/visits', visitRoutes.member);
app.use('/api/visit-requests', visitRoutes.admin);
app.use('/api/conversations', adminConversationRoutes);
app.use('/api/account', accountRoutes);

// The website itself: every top-level folder/file of the project except server/
// (which holds .env and the database) and dotfiles. The list is exact, so encoded
// or Windows-equivalent spellings of "server" can't slip through.
const SITE_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_ENTRIES = new Set(
  fs.readdirSync(SITE_ROOT)
    .filter((name) => !name.startsWith('.') && name.toLowerCase() !== 'server' && !name.toLowerCase().startsWith('server-'))
    .map((name) => name.toLowerCase())
);

function isPublicPath(urlPath) {
  let firstSegment;
  try {
    firstSegment = decodeURIComponent(urlPath).split(/[\\/]/).filter(Boolean)[0];
  } catch (err) {
    return false;
  }
  return firstSegment === undefined || PUBLIC_ENTRIES.has(firstSegment.toLowerCase());
}

const serveSite = express.static(SITE_ROOT);
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || !isPublicPath(req.path)) return next();
  serveSite(req, res, next);
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).send(
    '<!DOCTYPE html><title>Page not found</title>' +
    '<body style="font-family:sans-serif;text-align:center;padding:4rem">' +
    '<h1>Page not found</h1><p>This page does not exist yet.</p><p><a href="/">Back to the home page</a></p></body>'
  );
});

app.use((err, req, res, next) => {
  const refusal = err instanceof HttpError ? err : fromDatabase(err);
  if (refusal) {
    return res.status(refusal.status).json({ error: refusal.message, ...refusal.extra });
  }
  if (err.type === 'entity.too.large') {
    const video = /\/video$/.test(req.path);
    return res.status(413).json({ error: video ? 'That video is too large.' : 'That file is too large. The limit is 3 MB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'That request could not be read.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
// Hosts such as alwaysdata give the address to listen on in IP (or HOST).
const LISTEN_HOST = process.env.IP || process.env.HOST || undefined;

async function start() {
  try {
    if (await db.ensureDatabase()) console.log(`Created the ${db.DB_NAME} database in MySQL.`);
    const firstAdmin = await ensureFirstAdmin({ allowDefault: process.env.NODE_ENV !== 'production' });
    if (firstAdmin.created) {
      console.log(`Created first admin account: ${firstAdmin.email}`);
    } else if (firstAdmin.missingSettings) {
      console.warn('No admin account yet — set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create one.');
    }
  } catch (err) {
    console.error('Could not use the MySQL database: ' + err.message);
    console.error('Check DB_HOST, DB_PORT, DB_USER and DB_PASSWORD in server/.env, and that MySQL is running.');
    process.exit(1);
  }

  const server = app.listen(PORT, LISTEN_HOST, () => {
    console.log(LISTEN_HOST
      ? `CAM Orphanage Connect listening on ${LISTEN_HOST} port ${PORT}`
      : `CAM Orphanage Connect running on http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use — the site is probably already running. Open http://localhost:${PORT}`);
      process.exit(1);
    }
    throw err;
  });
}

start();
