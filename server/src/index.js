require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env — copy .env.example to .env and set one before starting the server.');
  process.exit(1);
}

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

const app = express();
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

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`CAM Orphanage Connect API running on http://localhost:${PORT}`);
});
