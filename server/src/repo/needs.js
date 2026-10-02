const db = require('../db');
const common = require('./common');

// Needs with their progress. "Raised" is the need's running total, which only the triggers on
// the donations table change, so it always equals the pledges and gifts made to the need.

const BASE = 'SELECT n.*, n.pledged_amount AS raised FROM needs n';

function toNeed(row) {
  const goal = Number(row.goal_amount);
  const raised = Number(row.raised);
  return {
    id: row.id,
    orphanageId: row.orphanage_id,
    title: row.title,
    description: row.description,
    goal: goal,
    raised: raised,
    percent: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
    date: db.dateOnly(row.created_at),
    status: row.status,
  };
}

async function list() {
  return (await db.q(BASE + ' ORDER BY n.id DESC')).map(toNeed);
}

async function get(id) {
  const row = await db.one(BASE + ' WHERE n.id = ?', [id]);
  return row ? toNeed(row) : null;
}

async function forOrphanage(orphanageId) {
  return (await db.q(BASE + ' WHERE n.orphanage_id = ? ORDER BY n.id DESC', [orphanageId])).map(toNeed);
}

// Open needs of verified orphanages that donors and partners can pledge to.
async function openForVerifiedOrphanages() {
  return (await db.q(
    BASE + ` JOIN orphanages o ON o.id = n.orphanage_id
     WHERE o.verification_status = 'verified' AND n.status = 'open' ORDER BY n.id DESC`
  )).map(toNeed);
}

async function create({ orphanageId, title, description, goal, date }) {
  const result = await db.run(
    'INSERT INTO needs (orphanage_id, title, description, goal_amount, created_at) VALUES (?, ?, ?, ?, ?)',
    [orphanageId, String(title).trim().slice(0, 200), common.text(description), goal, db.sqlTime(date)]
  );
  return get(result.insertId);
}

async function update(id, fields) {
  const sets = {};
  if (fields.orphanageId !== undefined) sets.orphanage_id = fields.orphanageId;
  if (fields.title !== undefined) sets.title = String(fields.title).trim().slice(0, 200);
  if (fields.description !== undefined) sets.description = common.text(fields.description);
  if (fields.goal !== undefined) sets.goal_amount = fields.goal;
  if (fields.date) sets.created_at = db.sqlTime(fields.date);
  const columns = Object.keys(sets);
  if (columns.length > 0) {
    await db.run('UPDATE needs SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
  }
  return get(id);
}

async function remove(id) {
  const result = await db.run('DELETE FROM needs WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { list, get, forOrphanage, openForVerifiedOrphanages, create, update, remove };
