const express = require('express');
const { authenticate } = require('../middleware/auth');
const chat = require('../chat');

// The admin's view of every orphanage <-> donor / partner conversation. Admins can read all of
// them and step in with a message that is labelled as coming from the CAM Orphanage Connect team.
const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const conversations = (await chat.allThreads())
    .filter((t) => t.messages.length > 0)
    .map((t) => chat.viewForAdmin(t))
    .map((c) => { delete c.messages; return c; })
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ conversations: conversations });
});

router.get('/:key', async (req, res) => {
  res.json({ conversation: chat.viewForAdmin(await chat.getThread(req.params.key)) });
});

router.post('/:key/reply', async (req, res) => {
  const text = chat.cleanText(req.body && req.body.text);
  const thread = await chat.getThread(req.params.key);
  res.status(201).json({ conversation: chat.viewForAdmin(await chat.appendMessage(thread, 'admin', text, req.admin.id)) });
});

// Remove one message (for example abuse). The conversation keeps a note that something was removed.
router.delete('/:key/messages/:index', async (req, res) => {
  const thread = await chat.getThread(req.params.key);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= thread.messages.length) {
    throw new chat.ChatError(404, 'Message not found.');
  }
  res.json({ conversation: chat.viewForAdmin(await chat.removeMessage(thread, index, req.admin.id)) });
});

module.exports = router;
