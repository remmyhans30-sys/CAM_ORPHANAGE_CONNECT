const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');

// Visit requests: an approved donor or verified partner asks to visit an orphanage, and the
// orphanage decides. Stored in visit_requests.

const BASE = `
  SELECT v.*, o.name AS orphanage_name, o.owner_user_id AS orphanage_user_id,
         u.display_name, u.email, u.role, dp.location_text, p.name AS partner_name
  FROM visit_requests v
  JOIN orphanages o ON o.id = v.orphanage_id
  JOIN users u ON u.id = v.requester_user_id
  LEFT JOIN donor_profiles dp ON dp.user_id = u.id
  LEFT JOIN partner_organizations p ON p.owner_user_id = u.id`;

const MAX_PENDING_TOTAL = 10;
const MAX_PENDING_PER_HOME = 2;
const MAX_DAYS_AHEAD = 365;

// who: 'requester' (their own list), 'orphanage' (the home's inbox) or 'admin'.
// The requester's email is only shared with the home once it has approved the visit.
function toVisit(row, who) {
  const visit = {
    id: row.id,
    orphanageId: row.orphanage_id,
    orphanageName: row.orphanage_name,
    preferredDate: db.dateOnly(row.preferred_date),
    visitorsCount: row.visitors_count,
    message: row.message,
    status: row.status,
    responseNote: row.response_note,
    respondedAt: db.isoTime(row.responded_at),
    createdAt: db.isoTime(row.created_at),
  };
  if (who !== 'requester') {
    visit.requesterName = row.role === 'partner' && row.partner_name ? row.partner_name : row.display_name;
    visit.requesterType = row.role === 'partner' ? 'partner' : 'donor';
    visit.requesterLocation = row.location_text || null;
    if (who === 'admin' || row.status === 'approved') visit.requesterEmail = row.email;
  }
  return visit;
}

async function forRequester(userId) {
  return (await db.q(BASE + ' WHERE v.requester_user_id = ? ORDER BY v.id DESC', [userId])).map((r) => toVisit(r, 'requester'));
}

async function forOrphanage(orphanageId) {
  return (await db.q(BASE + ' WHERE v.orphanage_id = ? ORDER BY v.id DESC', [orphanageId])).map((r) => toVisit(r, 'orphanage'));
}

async function all() {
  return (await db.q(BASE + ' ORDER BY v.id DESC')).map((r) => toVisit(r, 'admin'));
}

function tomorrow() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function create({ userId, orphanageId, preferredDate, visitorsCount, message }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(preferredDate || '')) || Number.isNaN(new Date(preferredDate).getTime())) {
    throw new HttpError(400, 'Please choose the date you would like to visit.');
  }
  if (preferredDate < tomorrow()) throw new HttpError(400, 'Please choose a date from tomorrow onwards, so the home has time to prepare.');
  if (preferredDate > daysAhead(MAX_DAYS_AHEAD)) throw new HttpError(400, 'Please choose a date within the next year.');

  const visitors = Number(visitorsCount);
  if (!Number.isInteger(visitors) || visitors < 1 || visitors > 20) throw new HttpError(400, 'The number of visitors must be between 1 and 20.');

  const note = common.text(message);
  if (note && note.length > 1000) throw new HttpError(400, 'Your message is too long (1,000 characters at most).');

  const pending = await db.one("SELECT COUNT(*) AS total, SUM(orphanage_id = ?) AS here FROM visit_requests WHERE requester_user_id = ? AND status = 'pending'", [orphanageId, userId]);
  if (Number(pending.here || 0) >= MAX_PENDING_PER_HOME) throw new HttpError(400, 'You already have ' + MAX_PENDING_PER_HOME + ' requests waiting for this orphanage. Please wait for its answer first.');
  if (Number(pending.total) >= MAX_PENDING_TOTAL) throw new HttpError(400, 'You already have ' + MAX_PENDING_TOTAL + ' requests waiting. Please wait for answers before sending more.');

  const result = await db.run(
    'INSERT INTO visit_requests (orphanage_id, requester_user_id, preferred_date, visitors_count, message) VALUES (?, ?, ?, ?, ?)',
    [orphanageId, userId, preferredDate, visitors, note]
  );
  return result.insertId;
}

// The orphanage answers a request that is still waiting.
async function respond(id, orphanageId, decision, note) {
  const row = await db.one('SELECT status FROM visit_requests WHERE id = ? AND orphanage_id = ?', [id, orphanageId]);
  if (!row) throw new HttpError(404, 'Visit request not found.');
  if (row.status !== 'pending') throw new HttpError(400, 'This request has already been answered or cancelled.');
  if (!['approved', 'declined'].includes(decision)) throw new HttpError(400, 'Please approve or decline the request.');
  const text = common.text(note, 500);
  if (decision === 'declined' && !text) throw new HttpError(400, 'Please give a short reason, so the visitor understands.');
  await db.run('UPDATE visit_requests SET status = ?, response_note = ?, responded_at = ? WHERE id = ?', [decision, text, db.sqlTime(), id]);
}

async function cancel(id, userId) {
  const row = await db.one('SELECT status FROM visit_requests WHERE id = ? AND requester_user_id = ?', [id, userId]);
  if (!row) throw new HttpError(404, 'Visit request not found.');
  if (row.status !== 'pending') throw new HttpError(400, 'Only a request that is still waiting can be cancelled.');
  await db.run("UPDATE visit_requests SET status = 'cancelled' WHERE id = ?", [id]);
}

module.exports = { forRequester, forOrphanage, all, create, respond, cancel };
