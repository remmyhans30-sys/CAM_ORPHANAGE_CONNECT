const express = require('express');
const { authenticate } = require('../middleware/auth');
const donors = require('../repo/donors');

const router = express.Router();
router.use(authenticate);

const actorOf = (req) => ({ userId: req.admin.id, email: req.admin.email, isAdmin: true });

router.get('/', async (req, res) => {
  res.json({ donors: await donors.list() });
});

router.get('/:id', async (req, res) => {
  const donor = await donors.get(req.params.id);
  if (!donor) return res.status(404).json({ error: 'Donor not found.' });
  res.json({ donor });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  const id = await donors.createByAdmin(body);
  res.status(201).json({ donor: await donors.save(id, body, actorOf(req)) });
});

router.put('/:id', async (req, res) => {
  const donor = await donors.save(Number(req.params.id), req.body || {}, actorOf(req));
  if (!donor) return res.status(404).json({ error: 'Donor not found.' });
  res.json({ donor });
});

router.delete('/:id', async (req, res) => {
  if (!(await donors.remove(req.params.id))) return res.status(404).json({ error: 'Donor not found.' });
  res.status(204).send();
});

module.exports = router;
