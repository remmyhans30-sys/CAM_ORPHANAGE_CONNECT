const express = require('express');
const orphanages = require('../repo/orphanages');
const needs = require('../repo/needs');

// Verified orphanages and their open needs, for approved donors only.
const { requireApprovedDonor } = require('../middleware/donorAccess');

const router = express.Router();
router.use(requireApprovedDonor);

router.get('/orphanages', async (req, res) => {
  const homes = (await orphanages.verifiedList()).map((o) => ({
    id: o.id,
    name: o.name,
    location: o.location,
    story: o.story,
    childrenCount: o.childrenCount,
    photoUrl: o.photoUrl,
    needs: [],
  }));

  const byId = new Map(homes.map((o) => [o.id, o]));
  (await needs.openForVerifiedOrphanages()).forEach((n) => {
    const home = byId.get(n.orphanageId);
    if (home) {
      home.needs.push({ id: n.id, title: n.title, description: n.description, goal: n.goal, raised: n.raised, percent: n.percent });
    }
  });

  res.json({ orphanages: homes });
});

module.exports = router;
