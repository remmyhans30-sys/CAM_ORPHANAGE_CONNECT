const express = require('express');
const orphanages = require('../repo/orphanages');
const needs = require('../repo/needs');
const posts = require('../repo/posts');
const profiles = require('../repo/profiles');

// Listed orphanages (verified, not flagged) and their open needs, for approved donors only.
const { requireApprovedDonor } = require('../middleware/donorAccess');

const router = express.Router();
router.use(requireApprovedDonor);

router.get('/orphanages', async (req, res) => {
  const homes = (await orphanages.listed()).map((o) => ({
    id: o.id,
    name: o.name,
    location: o.location,
    story: o.story,
    childrenCount: o.childrenCount,
    photoUrl: o.photoUrl,
    socialLinks: o.socialLinks,
    updatesCount: 0,
    needs: [],
  }));

  const byId = new Map(homes.map((o) => [o.id, o]));
  (await needs.openForListedOrphanages()).forEach((n) => {
    const home = byId.get(n.orphanageId);
    if (home) {
      home.needs.push({ id: n.id, title: n.title, description: n.description, goal: n.goal, raised: n.raised, percent: n.percent });
    }
  });

  const counts = await posts.countFor(homes.map((h) => h.id));
  homes.forEach((h) => { h.updatesCount = counts.get(h.id); });

  res.json({ orphanages: homes });
});

// One home's full profile (donor/orphanage.html): everything a donor can see before giving.
router.get('/orphanages/:id', async (req, res) => {
  const profile = await profiles.forSupporters(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json(profile);
});

// The stories, updates and videos of one verified orphanage.
router.get('/orphanages/:id/updates', async (req, res) => {
  const updates = await profiles.updatesFor(req.params.id);
  if (!updates) return res.status(404).json({ error: 'Orphanage not found.' });
  res.json(updates);
});

module.exports = router;
