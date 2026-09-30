const express = require('express');
const db = require('../db');

// What anyone can see without an account: verified orphanages and their open needs.
const router = express.Router();

router.get('/orphanages', (req, res) => {
  const orphanages = db
    .prepare("SELECT id, name, location, story, children_count, photo_url FROM orphanages WHERE status = 'verified' ORDER BY name")
    .all()
    .map((o) => ({
      id: o.id,
      name: o.name,
      location: o.location,
      story: o.story,
      childrenCount: o.children_count,
      photoUrl: o.photo_url,
      needs: [],
    }));

  const byId = new Map(orphanages.map((o) => [o.id, o]));
  db.prepare(
    `SELECT n.id, n.orphanage_id, n.title, n.description, n.goal, n.raised, n.percent
     FROM needs n JOIN orphanages o ON o.id = n.orphanage_id
     WHERE o.status = 'verified' AND n.goal > 0
     ORDER BY n.id DESC`
  ).all().forEach((n) => {
    byId.get(n.orphanage_id).needs.push({
      id: n.id,
      title: n.title,
      description: n.description,
      goal: n.goal,
      raised: n.raised,
      percent: n.percent,
    });
  });

  res.json({ orphanages: orphanages });
});

module.exports = router;
