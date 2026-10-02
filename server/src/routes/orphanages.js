const express = require('express');
const { authenticate } = require('../middleware/auth');
const orphanages = require('../repo/orphanages');

const router = express.Router();
router.use(authenticate);

const actorOf = (req) => ({ userId: req.admin.id, email: req.admin.email, isAdmin: true });

router.get('/', async (req, res) => {
  res.json({ orphanages: await orphanages.list() });
});

router.get('/:id', async (req, res) => {
  const orphanage = await orphanages.get(req.params.id);
  if (!orphanage) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json({ orphanage });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  const id = await orphanages.createByAdmin(body, req.admin.id);
  res.status(201).json({ orphanage: await orphanages.save(id, body, actorOf(req)) });
});

router.put('/:id', async (req, res) => {
  const orphanage = await orphanages.save(Number(req.params.id), req.body || {}, actorOf(req));
  if (!orphanage) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json({ orphanage });
});

router.delete('/:id', async (req, res) => {
  if (!(await orphanages.remove(req.params.id))) return res.status(404).json({ error: 'Orphanage not found.' });
  res.status(204).send();
});

module.exports = router;
