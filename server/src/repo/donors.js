const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');
const donations = require('./donations');

// Donors as the pages see them. A donor's id is their user id; the details live in
// users + donor_profiles, the gifts in donations, and the history in audit_log.

const BASE = `
  SELECT u.id, u.display_name, u.email, u.created_at AS joined_at, p.*, m.name AS payment_name,
         (SELECT COUNT(*) FROM follows f WHERE f.user_id = u.id) AS follow_count,
         (SELECT COUNT(*) FROM recurring_gifts r WHERE r.giver_user_id = u.id AND r.status = 'active') AS recurring_count,
         ref.display_name AS referrer_name
  FROM users u
  JOIN donor_profiles p ON p.user_id = u.id
  LEFT JOIN payment_methods m ON m.id = p.preferred_payment_method_id
  LEFT JOIN users ref ON ref.id = p.referred_by_user_id`;

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const gifts = await donations.forGivers(ids);
  const activity = await common.activityFor('donor', ids);

  const followed = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT f.user_id, o.name FROM follows f JOIN orphanages o ON o.id = f.orphanage_id WHERE f.user_id IN (?) ORDER BY f.created_at', [ids]))
    .forEach((r) => followed.get(r.user_id).push({ name: r.name, tier: 'Follower' }));

  const referred = new Map(ids.map((id) => [id, []]));
  (await db.q(
    `SELECT p.referred_by_user_id AS referrer, u.display_name, p.approval_status FROM donor_profiles p JOIN users u ON u.id = p.user_id
     WHERE p.referred_by_user_id IN (?)`, [ids]))
    .forEach((r) => referred.get(r.referrer).push({ name: r.display_name, active: r.approval_status === 'active' }));

  const resets = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT user_id, created_at, used_at, expires_at FROM password_reset_tokens WHERE user_id IN (?) ORDER BY id', [ids]))
    .forEach((r) => resets.get(r.user_id).push({ date: db.dateOnly(r.created_at), method: 'Email link', status: r.used_at ? 'completed' : 'expired' }));

  const tickets = new Map(ids.map((id) => [id, []]));
  (await db.q("SELECT support_user_id, subject, status FROM conversations WHERE kind = 'support' AND support_user_id IN (?)", [ids]))
    .forEach((r) => tickets.get(r.support_user_id).push({ issue: r.subject || 'Conversation with the team', status: r.status === 'open' || r.status === 'in_progress' ? 'open' : 'resolved' }));

  return rows.map((d) => {
    const all = gifts.get(d.id);
    const made = all.filter((g) => g.status !== 'failed');
    const failed = all.filter((g) => g.status === 'failed');
    return {
      id: d.id,
      name: d.display_name,
      email: d.email,
      joinDate: db.dateOnly(d.joined_at),
      location: d.location_text,
      preferredPayment: d.payment_name,
      preferredCurrency: d.preferred_currency,
      lastActive: db.dateOnly(d.last_active_at) || db.dateOnly(d.joined_at),
      vip: Boolean(d.is_vip),
      status: d.approval_status,
      flagReason: d.status_reason,
      totalGiven: made.filter((g) => g.type === 'money' && ['pledged', 'completed'].includes(g.status)).reduce((s, g) => s + g.amount, 0),
      donationsCount: made.length,
      homesFollowedCount: d.follow_count,
      activeRecurringGifts: d.recurring_count,
      chargebacksCount: all.filter((g) => g.status === 'refunded').length,
      photoUrl: common.photoUrlOf(d.photo_upload_id),
      referredBy: d.referral_source || d.referrer_name || null,
      adminNotes: d.admin_notes,
      donations: made,
      passwordResets: resets.get(d.id),
      failedPayments: failed.map((g) => ({ date: g.date, amount: g.amount, method: g.method, reason: g.reason || 'Payment failed' })),
      supportTickets: tickets.get(d.id),
      referralsMade: referred.get(d.id),
      homesFollowed: followed.get(d.id),
      groupsJoined: [],
      activityLog: activity.get(d.id),
    };
  });
}

async function list() {
  return hydrate(await db.q(BASE + ' ORDER BY u.id DESC'));
}

async function get(id) {
  const rows = await hydrate(await db.q(BASE + ' WHERE u.id = ?', [id]));
  return rows[0] || null;
}

// Every donor sign-up gets a donor profile; new donors are 'pending' until an admin approves them.
async function ensureForUser(user) {
  const existing = await get(user.id);
  if (existing) return existing;
  await db.run("INSERT INTO donor_profiles (user_id, approval_status, last_active_at) VALUES (?, 'pending', ?)", [user.id, db.sqlTime()]);
  await common.logActivity('donor', user.id, 'Signed up', user.email, user.id);
  return get(user.id);
}

const ACCESS_MESSAGES = {
  pending: 'Your donor account is waiting for approval by the CAM Orphanage Connect team. You can browse orphanages and give once it is approved.',
  rejected: 'Your donor account was not approved. Please contact the CAM Orphanage Connect team.',
  flagged: 'Your donor account is under review by the CAM Orphanage Connect team.',
};

// Can this donor browse orphanages and pledge? Returns { ok: true } or the reason why not.
async function accessFor(user) {
  const donor = await ensureForUser(user);
  if (donor.status === 'active') return { ok: true, donor };
  const code = ACCESS_MESSAGES[donor.status] ? donor.status : 'pending';
  return { ok: false, code, error: ACCESS_MESSAGES[code], donor };
}

// A donor added by an admin (not a sign-up): their login cannot be used until they register.
async function createByAdmin(body) {
  const id = await common.createPlaceholderUser('donor', String(body.name).trim(), body.email);
  await db.run("INSERT INTO donor_profiles (user_id, approval_status) VALUES (?, 'active')", [id]);
  return id;
}

const CURRENCY_ALIASES = { FCFA: 'XAF', CFA: 'XAF', XAF: 'XAF', EUR: 'EUR', USD: 'USD' };

async function save(id, body, actor) {
  const current = await db.one('SELECT u.*, p.approval_status FROM users u JOIN donor_profiles p ON p.user_id = u.id WHERE u.id = ?', [id]);
  if (!current) return null;

  await db.tx(async () => {
    const userSets = {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw new HttpError(400, 'Name is required.');
      userSets.display_name = name.slice(0, 150);
    }
    if (body.email !== undefined && body.email && String(body.email).trim().toLowerCase() !== current.email) {
      userSets.email = String(body.email).trim().toLowerCase();
    }
    const userColumns = Object.keys(userSets);
    if (userColumns.length > 0) {
      await db.run('UPDATE users SET ' + userColumns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...userColumns.map((c) => userSets[c]), id]);
    }

    const sets = {};
    if (body.location !== undefined) sets.location_text = common.text(body.location, 150);
    if (body.preferredPayment !== undefined) sets.preferred_payment_method_id = body.preferredPayment ? await common.paymentMethodId(body.preferredPayment) : null;
    if (body.preferredCurrency !== undefined) sets.preferred_currency = CURRENCY_ALIASES[String(body.preferredCurrency || '').toUpperCase()] || 'XAF';
    if (body.vip !== undefined) sets.is_vip = common.flag(body.vip);
    if (body.referredBy !== undefined) sets.referral_source = common.text(body.referredBy, 120);
    if (body.adminNotes !== undefined) sets.admin_notes = common.text(body.adminNotes);
    if (body.flagReason !== undefined) sets.status_reason = common.text(body.flagReason, 500);
    if (body.photoUrl !== undefined) {
      const uploadId = common.uploadIdFromUrl(body.photoUrl);
      if (uploadId || !body.photoUrl) sets.photo_upload_id = uploadId;
    }
    if (body.status !== undefined) {
      if (!['pending', 'active', 'flagged', 'rejected'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
      sets.approval_status = body.status;
      if (body.status !== current.approval_status) {
        sets.decided_by = actor && actor.isAdmin ? actor.userId : null;
        sets.decided_at = db.sqlTime();
      }
    }

    const columns = Object.keys(sets);
    if (columns.length > 0) {
      await db.run('UPDATE donor_profiles SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE user_id = ?', [...columns.map((c) => sets[c]), id]);
    }

    if (Array.isArray(body.donations)) await saveDonations(id, body.donations);
    if (Object.prototype.hasOwnProperty.call(body, 'activityLog')) {
      await common.syncActivity('donor', id, body.activityLog, actor && actor.userId);
    }
  });

  return get(id);
}

// Gifts the admin logs by hand arrive as new entries (without an id); a changed status on an
// existing entry (for example refunded) is saved too. Gifts are never deleted from here.
async function saveDonations(giverUserId, incoming) {
  for (const entry of incoming) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.id) {
      if (entry.status && ['pledged', 'completed', 'failed', 'refunded', 'cancelled'].includes(entry.status)) {
        const row = await db.one('SELECT status FROM donations WHERE id = ? AND giver_user_id = ?', [entry.id, giverUserId]);
        if (row && row.status !== entry.status) await donations.setStatus(entry.id, entry.status);
      }
      continue;
    }
    const orphanage = await db.one('SELECT id FROM orphanages WHERE name = ? ORDER BY id LIMIT 1', [String(entry.orphanage || '')]);
    if (!orphanage) throw new HttpError(400, 'Choose an orphanage that exists on the platform for this donation.');
    const need = entry.need
      ? await db.one('SELECT id FROM needs WHERE orphanage_id = ? AND title = ? ORDER BY id LIMIT 1', [orphanage.id, String(entry.need)])
      : null;
    await donations.create({
      giverUserId, orphanageId: orphanage.id, needId: need ? need.id : null, type: entry.type,
      amount: Number(entry.amount) || 0, itemDescription: entry.itemDescription, quantity: entry.quantity,
      deliveryMethod: entry.deliveryMethod, method: entry.method, status: entry.status || 'completed', date: entry.date,
    });
  }
}

async function remove(id) {
  const result = await db.run("DELETE FROM users WHERE id = ? AND role = 'donor'", [id]);
  return result.affectedRows > 0;
}

module.exports = { list, get, ensureForUser, accessFor, createByAdmin, save, saveDonations, remove };
