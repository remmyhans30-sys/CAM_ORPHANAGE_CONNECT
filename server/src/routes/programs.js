const express = require('express');
const { authenticate } = require('../middleware/auth');
const { programs } = require('../repo/admin-data');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  res.json({ programs: await programs.list() });
});

router.get('/:id', async (req, res) => {
  const program = await programs.get(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  res.status(201).json({ program: await programs.create(body, req.admin.id) });
});

router.put('/:id', async (req, res) => {
  const program = await programs.update(Number(req.params.id), req.body || {});
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program });
});

router.delete('/:id', async (req, res) => {
  if (!(await programs.remove(req.params.id))) return res.status(404).json({ error: 'Program not found.' });
  res.status(204).send();
});

module.exports = router;
