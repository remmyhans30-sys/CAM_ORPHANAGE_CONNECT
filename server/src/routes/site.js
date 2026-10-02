const express = require('express');
const db = require('../db');

// Public information for the website's home and contact pages. Only totals and the
// organization's own contact details are shared; nothing about individual people.
const router = express.Router();

router.get('/stats', async (req, res) => {
  const row = await db.one('SELECT * FROM v_site_stats');
  res.json({
    verifiedOrphanages: Number(row.verified_orphanages),
    openNeeds: Number(row.open_needs),
    totalPledged: Number(row.total_pledged),
    approvedDonors: Number(row.approved_donors),
    verifiedPartners: Number(row.verified_partners),
  });
});

router.get('/info', async (req, res) => {
  const row = (await db.one('SELECT * FROM organization_settings WHERE id = 1')) || {};
  res.json({
    name: row.org_name || 'CAM Orphanage Connect',
    email: row.org_email || process.env.SUPPORT_EMAIL || null,
    phone: row.org_phone || null,
    address: row.org_address || null,
    description: row.org_description || null,
  });
});

module.exports = router;
