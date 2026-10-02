const crypto = require('crypto');
const db = require('../db');

// Small helpers shared by the repository modules. The pages still receive the same
// JSON shapes as before; these modules translate between those shapes and the tables.

const flag = (value) => (value ? 1 : 0);

function text(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  return max ? s.slice(0, max) : s;
}

function whole(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ---- activity log (audit_log) -------------------------------------------------

// Adds one line to the history of an orphanage, partner or donor.
async function logActivity(entityType, entityId, action, reviewer, actorUserId, at) {
  await db.run(
    'INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [actorUserId || null, String(action || '').slice(0, 255), entityType, entityId, JSON.stringify({ reviewer: reviewer || null }), db.sqlTime(at)]
  );
}

// The history lines for many records, oldest first, as { action, reviewer, timestamp }.
async function activityFor(entityType, ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return map;
  const rows = await db.q(
    `SELECT entity_id, action, JSON_UNQUOTE(JSON_EXTRACT(details, '$.reviewer')) AS reviewer, created_at
     FROM audit_log WHERE entity_type = ? AND entity_id IN (?) ORDER BY id`,
    [entityType, ids]
  );
  rows.forEach((r) => {
    map.get(r.entity_id).push({ action: r.action, reviewer: r.reviewer === 'null' ? null : r.reviewer, timestamp: db.isoTime(r.created_at) });
  });
  return map;
}

// The pages add new lines to the end of the list they were given and send the whole list
// back. Anything beyond what is already stored is new.
async function syncActivity(entityType, entityId, incoming, actorUserId) {
  if (!Array.isArray(incoming)) return;
  const stored = await db.one('SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
  for (const entry of incoming.slice(stored.n)) {
    if (entry && entry.action) await logActivity(entityType, entityId, entry.action, entry.reviewer, actorUserId, entry.timestamp);
  }
}

// ---- accounts -----------------------------------------------------------------

// Records that cannot sign in (created by an admin, or sample data) still need an owner
// login, because every orphanage, partner and donor belongs to a user.
async function createPlaceholderUser(role, displayName, preferredEmail) {
  const base = String(preferredEmail || '').trim().toLowerCase();
  let email = base;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || await db.one('SELECT id FROM users WHERE email = ?', [email])) {
    email = role + '-' + crypto.randomBytes(5).toString('hex') + '@no-login.invalid';
  }
  const result = await db.run(
    'INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
    [email, '!no-login-' + crypto.randomBytes(24).toString('hex'), role, String(displayName || 'Unnamed').slice(0, 150)]
  );
  return result.insertId;
}

async function paymentMethodId(name) {
  if (!name) return null;
  const row = await db.one('SELECT id FROM payment_methods WHERE name = ?', [String(name)]);
  if (row) return row.id;
  const other = await db.one("SELECT id FROM payment_methods WHERE name = 'Other'");
  return other ? other.id : null;
}

const photoUrlOf = (uploadId) => (uploadId ? '/api/files/photo/' + uploadId : null);

function uploadIdFromUrl(url) {
  const match = /^\/api\/files\/photo\/([0-9a-f]{32})$/.exec(url || '');
  return match ? match[1] : null;
}

// Verification documents of orphanages or partners, as { id, name, size, uploadedAt }.
async function documentsFor(ownerColumn, ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return map;
  const rows = await db.q(
    `SELECT vd.${ownerColumn} AS owner_id, u.id, u.original_name, u.size_bytes, u.created_at
     FROM verification_documents vd JOIN uploads u ON u.id = vd.upload_id
     WHERE vd.${ownerColumn} IN (?) AND u.deleted_at IS NULL ORDER BY vd.id`,
    [ids]
  );
  rows.forEach((r) => {
    map.get(r.owner_id).push({ id: r.id, name: r.original_name, size: r.size_bytes, uploadedAt: db.isoTime(r.created_at) });
  });
  return map;
}

module.exports = {
  flag, text, whole, logActivity, activityFor, syncActivity,
  createPlaceholderUser, paymentMethodId, photoUrlOf, uploadIdFromUrl, documentsFor,
};
