const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const { authenticate } = require('../middleware/auth');
const needs = require('../repo/needs');

const router = express.Router();
router.use(authenticate);

// "Raised" is calculated from the pledges, so only the goal, title, description and date are saved.
function fieldsOf(body) {
  const fields = {};
  if (body.orphanageId !== undefined) fields.orphanageId = Number(body.orphanageId);
  if (body.title !== undefined) fields.title = body.title;
  if (body.description !== undefined) fields.description = body.description;
  if (body.goal !== undefined) {
    const goal = Math.trunc(Number(body.goal));
    if (!Number.isFinite(goal) || goal <= 0) throw new HttpError(400, 'The goal must be more than zero.');
    fields.goal = goal;
  }
  if (body.date) fields.date = body.date;
  return fields;
}

async function checkOrphanage(orphanageId) {
  if (!(await db.one('SELECT id FROM orphanages WHERE id = ?', [orphanageId]))) {
    throw new HttpError(400, 'That orphanage does not exist.');
  }
}

router.get('/', async (req, res) => {
  res.json({ needs: await needs.list() });
});

router.get('/:id', async (req, res) => {
  const need = await needs.get(req.params.id);
  if (!need) return res.status(404).json({ error: 'Need not found.' });
  res.json({ need });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.title || !body.title.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!body.orphanageId) {
    return res.status(400).json({ error: 'An orphanage must be selected.' });
  }
  const fields = fieldsOf(body);
  if (!fields.goal) throw new HttpError(400, 'The goal must be more than zero.');
  await checkOrphanage(fields.orphanageId);
  res.status(201).json({ need: await needs.create(fields) });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await needs.get(id))) return res.status(404).json({ error: 'Need not found.' });
  const fields = fieldsOf(req.body || {});
  if (fields.orphanageId !== undefined) await checkOrphanage(fields.orphanageId);
  res.json({ need: await needs.update(id, fields) });
});

router.delete('/:id', async (req, res) => {
  if (!(await needs.remove(req.params.id))) return res.status(404).json({ error: 'Need not found.' });
  res.status(204).send();
});

module.exports = router;
