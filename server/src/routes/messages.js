const express = require('express');
const { authenticate } = require('../middleware/auth');
const support = require('../repo/support');

// The admin's Support Center: one thread per donor, orphanage or partner.
const router = express.Router();
router.use(authenticate);

const actorOf = (req) => ({ userId: req.admin.id, email: req.admin.email, isAdmin: true });

function toMessage(conv) {
  const { supportUserId, messages, ...legacy } = conv;
  return legacy;
}

router.get('/', async (req, res) => {
  res.json({ messages: (await support.list()).map(toMessage) });
});

router.get('/:id', async (req, res) => {
  const conv = await support.get(Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'Message not found.' });
  res.json({ message: toMessage(conv) });
});

// Open (or find) the thread with one account, so the admin can write to anybody first.
router.post('/thread', async (req, res) => {
  const { accountType, accountId } = req.body || {};
  if (!accountType || accountId === undefined || accountId === null) {
    return res.status(400).json({ error: 'accountType and accountId are required.' });
  }

  const userId = await support.userIdFor(accountType, Number(accountId));
  if (!userId) return res.status(404).json({ error: 'That account does not exist.' });

  const existing = await support.forUser(userId);
  if (existing) return res.json({ message: toMessage(existing) });

  res.status(201).json({ message: toMessage(await support.ensureForUser(userId)) });
});

router.put('/:id', async (req, res) => {
  const conv = await support.save(Number(req.params.id), req.body || {}, actorOf(req));
  if (!conv) return res.status(404).json({ error: 'Message not found.' });
  res.json({ message: toMessage(conv) });
});

router.delete('/:id', async (req, res) => {
  if (!(await support.remove(Number(req.params.id)))) return res.status(404).json({ error: 'Message not found.' });
  res.status(204).send();
});

module.exports = router;
