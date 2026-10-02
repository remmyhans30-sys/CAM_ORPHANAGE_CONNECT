const express = require('express');
const { authenticate } = require('../middleware/auth');
const { reports } = require('../repo/admin-data');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  res.json({ reports: await reports.list() });
});

router.get('/:id', async (req, res) => {
  const report = await reports.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report });
});

router.post('/', async (req, res) => {
  res.status(201).json({ report: await reports.create(req.body || {}) });
});

router.put('/:id', async (req, res) => {
  const report = await reports.update(Number(req.params.id), req.body || {}, req.admin.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report });
});

router.delete('/:id', async (req, res) => {
  if (!(await reports.remove(req.params.id))) return res.status(404).json({ error: 'Report not found.' });
  res.status(204).send();
});

module.exports = router;
