const express = require('express');
const { authenticate } = require('../middleware/auth');
const { settings } = require('../repo/admin-data');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  res.json({ settings: await settings.get() });
});

router.put('/', async (req, res) => {
  res.json({ settings: await settings.update(req.body || {}, req.admin.id) });
});

module.exports = router;
