const db = require('../db');
const common = require('./common');

// Pledges and gifts (the donations table), in the shape the admin and partner pages show.

const SELECT = `
  SELECT d.*, o.name AS orphanage_name, n.title AS need_title, m.name AS method_name
  FROM donations d
  JOIN orphanages o ON o.id = d.orphanage_id
  LEFT JOIN needs n ON n.id = d.need_id
  LEFT JOIN payment_methods m ON m.id = d.payment_method_id`;

function toDonation(row) {
  return {
    id: row.id,
    type: row.donation_type,
    orphanage: row.orphanage_name,
    orphanageId: row.orphanage_id,
    need: row.need_title || '',
    amount: row.amount === null ? 0 : Number(row.amount),
    method: row.method_name || (row.status === 'pledged' ? 'Pledge' : ''),
    date: db.dateOnly(row.pledged_at || row.created_at),
    status: row.status,
    itemDescription: row.item_description || undefined,
    quantity: row.item_quantity || '',
    deliveryMethod: row.delivery_method || '',
    reason: row.failure_reason || undefined,
    anonymous: Boolean(row.is_anonymous),
    needId: row.need_id,
    createdAt: db.isoTime(row.created_at),
    giverUserId: row.giver_user_id,
  };
}

// All gifts of the given givers (donor or partner logins): Map(userId -> list).
async function forGivers(userIds) {
  const map = new Map(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return map;
  const rows = await db.q(SELECT + ' WHERE d.giver_user_id IN (?) ORDER BY d.pledged_at DESC, d.id DESC', [userIds]);
  rows.forEach((r) => map.get(r.giver_user_id).push(toDonation(r)));
  return map;
}

// The money pledged to an orphanage, newest first (the orphanage portal's pledge list).
async function pledgesToOrphanage(orphanageId) {
  return db.q(
    `SELECT d.id, d.amount, d.is_anonymous, d.created_at, u.display_name, n.title AS need_title
     FROM donations d JOIN users u ON u.id = d.giver_user_id LEFT JOIN needs n ON n.id = d.need_id
     WHERE d.orphanage_id = ? AND d.donation_type = 'money' AND d.status IN ('pledged', 'completed')
     ORDER BY d.id DESC`,
    [orphanageId]
  );
}

async function pledgesBy(userId) {
  return db.q(
    `SELECT d.id, d.need_id, d.amount, d.is_anonymous, d.created_at, n.title AS need_title, o.name AS orphanage_name
     FROM donations d JOIN orphanages o ON o.id = d.orphanage_id LEFT JOIN needs n ON n.id = d.need_id
     WHERE d.giver_user_id = ? AND d.donation_type = 'money' AND d.status IN ('pledged', 'completed')
     ORDER BY d.id DESC`,
    [userId]
  );
}

// Records one gift. The database itself refuses gifts that break the rules (unapproved giver,
// unverified orphanage, closed or over-filled need).
async function create(g) {
  const at = db.sqlTime(g.date);
  const status = g.status || 'pledged';
  const result = await db.run(
    `INSERT INTO donations (giver_user_id, orphanage_id, need_id, donation_type, amount, item_description, item_quantity,
                            delivery_method, payment_method_id, status, is_anonymous, failure_reason, pledged_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      g.giverUserId, g.orphanageId, g.needId || null, g.type === 'item' ? 'item' : 'money',
      g.amount > 0 ? g.amount : null, common.text(g.itemDescription, 500), common.text(g.quantity, 60),
      common.text(g.deliveryMethod, 100), await common.paymentMethodId(g.method === 'Pledge' ? null : g.method),
      status, common.flag(g.anonymous), common.text(g.reason, 255), at, status === 'completed' ? at : null, at,
    ]
  );
  return result.insertId;
}

async function setStatus(id, status) {
  await db.run('UPDATE donations SET status = ?, completed_at = IF(? = "completed", COALESCE(completed_at, ?), completed_at) WHERE id = ?', [status, status, db.sqlTime(), id]);
}

module.exports = { toDonation, forGivers, pledgesToOrphanage, pledgesBy, create, setStatus };
