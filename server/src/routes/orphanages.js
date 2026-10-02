const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../db');
const orphanages = require('../repo/orphanages');
const notify = require('../notify');
const { videoUrl } = require('../uploads');

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
  const before = await orphanages.get(Number(req.params.id));
  const orphanage = await orphanages.save(Number(req.params.id), req.body || {}, actorOf(req));
  if (!orphanage) return res.status(404).json({ error: 'Orphanage not found.' });
  // The home hears by email about the team's verification decision.
  if (before && before.status !== orphanage.status) notify.orphanageDecision(orphanage.id, orphanage.status);
  res.json({ orphanage });
});

// A short-lived link so an admin can watch the video of a post while reviewing a profile.
router.get('/:id/posts/:postId/video-link', async (req, res) => {
  const row = await db.one('SELECT video_upload_id FROM orphanage_posts WHERE id = ? AND orphanage_id = ?', [req.params.postId, req.params.id]);
  if (!row || !row.video_upload_id) return res.status(404).json({ error: 'No video on that post.' });
  res.json({ url: videoUrl(row.video_upload_id) });
});

router.delete('/:id', async (req, res) => {
  if (!(await orphanages.remove(req.params.id))) return res.status(404).json({ error: 'Orphanage not found.' });
  res.status(204).send();
});

module.exports = router;
