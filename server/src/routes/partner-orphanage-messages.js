const express = require('express');
const { authenticate } = require('../middleware/auth');
const chat = require('../chat');

// The admin's view of the chats between partners and orphanages (shown on the partner profile).
const router = express.Router();
router.use(authenticate);

function toThread(thread) {
  return {
    id: thread.id,
    partnerId: thread.other.id,
    partnerName: thread.other.name,
    orphanageId: thread.orphanage.id,
    orphanageName: thread.orphanage.name,
    messages: thread.messages.map((m) => ({ text: m.text, timestamp: m.timestamp, sender: m.sender })),
    updatedAt: thread.updatedAt,
  };
}

async function partnerThreads() {
  return (await chat.allThreads()).filter((t) => t.kind === 'po');
}

router.get('/', async (req, res) => {
  const threads = (await partnerThreads()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ threads: threads.map(toThread) });
});

router.get('/:id', async (req, res) => {
  const thread = await chat.threadById(Number(req.params.id));
  if (!thread || thread.kind !== 'po') return res.status(404).json({ error: 'Thread not found.' });
  res.json({ thread: toThread(thread) });
});

router.post('/:id/reply', async (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });

  const existing = await chat.threadById(Number(req.params.id));
  if (!existing || existing.kind !== 'po') return res.status(404).json({ error: 'Thread not found.' });

  res.json({ thread: toThread(await chat.appendMessage(existing, 'admin', chat.cleanText(text), req.admin.id)) });
});

router.delete('/:id', async (req, res) => {
  const existing = await chat.threadById(Number(req.params.id));
  if (!existing || existing.kind !== 'po') return res.status(404).json({ error: 'Thread not found.' });
  await chat.deleteThread(existing.id);
  res.status(204).send();
});

module.exports = router;
