const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');
const posts = require('./posts');

// Orphanages as the pages see them (camelCase, status 'needs-info', lists inside), stored in
// orphanages + orphanage_payment_accounts + orphanage_photos + orphanage_posts +
// verification_documents + appeals + audit_log.

const STATUS_OUT = { draft: 'draft', pending: 'pending', needs_info: 'needs-info', verified: 'verified', rejected: 'rejected' };
const STATUS_IN = { draft: 'draft', pending: 'pending', 'needs-info': 'needs_info', needs_info: 'needs_info', verified: 'verified', rejected: 'rejected' };

const BASE = `SELECT o.*, (SELECT COUNT(*) FROM follows f WHERE f.orphanage_id = o.id) AS followers FROM orphanages o`;

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const documents = await common.documentsFor('orphanage_id', ids);
  const activity = await common.activityFor('orphanage', ids);

  const gallery = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT orphanage_id, upload_id FROM orphanage_photos WHERE orphanage_id IN (?) ORDER BY sort_order, id', [ids]))
    .forEach((r) => gallery.get(r.orphanage_id).push(common.photoUrlOf(r.upload_id)));

  const postsByHome = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT id, orphanage_id, post_type, title, body, photo_upload_id, video_upload_id, created_at FROM orphanage_posts WHERE orphanage_id IN (?) AND hidden_at IS NULL ORDER BY id', [ids]))
    .forEach((r) => postsByHome.get(r.orphanage_id).push({
      id: r.id, type: r.post_type, title: r.title, date: db.dateOnly(r.created_at), text: r.body,
      photoUrl: common.photoUrlOf(r.photo_upload_id), hasVideo: Boolean(r.video_upload_id),
    }));
  const socialLinks = await posts.linksFor(ids);

  const payment = new Map();
  (await db.q(
    `SELECT a.*, m.name AS method_name FROM orphanage_payment_accounts a
     JOIN payment_methods m ON m.id = a.payment_method_id WHERE a.orphanage_id IN (?) ORDER BY a.id DESC`, [ids]))
    .forEach((r) => payment.set(r.orphanage_id, r));

  const appeals = new Map();
  (await db.q("SELECT subject_id, message, created_at FROM appeals WHERE subject_type = 'orphanage' AND status = 'open' AND subject_id IN (?) ORDER BY id", [ids]))
    .forEach((r) => appeals.set(r.subject_id, r));

  return rows.map((o) => {
    const pay = payment.get(o.id);
    const appeal = appeals.get(o.id);
    return {
      id: o.id,
      name: o.name,
      location: o.city,
      registrationNumber: o.registration_number,
      story: o.story,
      storyLanguage: o.story_language,
      status: STATUS_OUT[o.verification_status],
      childrenCount: o.children_count === null ? 0 : o.children_count,
      followersCount: o.followers,
      foundedYear: o.founded_year,
      capacity: o.capacity,
      contactName: o.contact_name,
      contactPhone: o.contact_phone,
      contactEmail: o.contact_email,
      termsAgreed: Boolean(o.terms_accepted_at),
      photoUrl: common.photoUrlOf(o.profile_photo_upload_id),
      coverPhotoUrl: common.photoUrlOf(o.cover_photo_upload_id),
      paymentProvider: pay ? (pay.provider_name || pay.method_name) : null,
      paymentAccountName: pay ? pay.account_holder : null,
      paymentAccountNumber: pay ? pay.account_number : null,
      paymentAccountConfirmed: Boolean(pay && pay.confirmed_at),
      flagged: Boolean(o.is_flagged),
      flagReason: o.flag_reason,
      rejectionReason: o.rejection_reason,
      appealMessage: appeal ? appeal.message : null,
      appealDate: appeal ? db.dateOnly(appeal.created_at) : null,
      infoRequestMessage: o.info_request_message,
      submittedDate: db.dateOnly(o.submitted_at),
      verifiedDate: o.verification_status === 'verified' ? db.dateOnly(o.decided_at) : null,
      joinedDate: db.dateOnly(o.created_at),
      blurFaces: Boolean(o.blur_faces),
      showFullNames: Boolean(o.show_full_names),
      documents: documents.get(o.id),
      gallery: gallery.get(o.id),
      posts: postsByHome.get(o.id),
      socialLinks: socialLinks.get(o.id),
      activityLog: activity.get(o.id),
      ownerUserId: o.owner_user_id,
    };
  });
}

async function list() {
  return hydrate(await db.q(BASE + ' ORDER BY o.id DESC'));
}

async function get(id) {
  const rows = await hydrate(await db.q(BASE + ' WHERE o.id = ?', [id]));
  return rows[0] || null;
}

async function getByOwner(userId) {
  const rows = await hydrate(await db.q(BASE + ' WHERE o.owner_user_id = ?', [userId]));
  return rows[0] || null;
}

// "Listed" homes are verified and not flagged: the ones donors and partners can see and give to.
// A home an admin flags for review is hidden from them until the flag is removed.
const LISTED = "o.verification_status = 'verified' AND o.is_flagged = 0";

async function listed() {
  return hydrate(await db.q(BASE + ' WHERE ' + LISTED + ' ORDER BY o.name ASC'));
}

async function getListed(id) {
  const rows = await hydrate(await db.q(BASE + ' WHERE o.id = ? AND ' + LISTED, [id]));
  return rows[0] || null;
}

// Verified, flagged or not. Conversations that already exist keep going while a home is flagged.
async function getVerified(id) {
  const rows = await hydrate(await db.q(BASE + " WHERE o.id = ? AND o.verification_status = 'verified'", [id]));
  return rows[0] || null;
}

// Every orphanage sign-up gets an orphanage record, starting as an incomplete 'draft'.
async function ensureForUser(user) {
  const existing = await getByOwner(user.id);
  if (existing) return existing;
  const result = await db.run(
    "INSERT INTO orphanages (owner_user_id, name, contact_email, verification_status) VALUES (?, ?, ?, 'draft')",
    [user.id, String(user.display_name).slice(0, 200), user.email]
  );
  await common.logActivity('orphanage', result.insertId, 'Signed up', user.email, user.id);
  return get(result.insertId);
}

// An orphanage added by an admin (no sign-up): it gets a login nobody can use.
async function createByAdmin(body, actorUserId) {
  const name = String(body.name || '').trim();
  const owner = await common.createPlaceholderUser('orphanage', name, body.contactEmail);
  const result = await db.run("INSERT INTO orphanages (owner_user_id, name, verification_status) VALUES (?, ?, 'draft')", [owner, name.slice(0, 200)]);
  return result.insertId;
}

const SCALARS = {
  name: (v) => ['name', String(v || '').trim().slice(0, 200)],
  location: (v) => ['city', common.text(v, 150)],
  registrationNumber: (v) => ['registration_number', common.text(v, 80)],
  story: (v) => ['story', common.text(v)],
  childrenCount: (v) => ['children_count', common.whole(v)],
  foundedYear: (v) => ['founded_year', common.whole(v)],
  capacity: (v) => ['capacity', common.whole(v)],
  contactName: (v) => ['contact_name', common.text(v, 120)],
  contactPhone: (v) => ['contact_phone', common.text(v, 40)],
  contactEmail: (v) => ['contact_email', common.text(v, 190)],
  flagged: (v) => ['is_flagged', common.flag(v)],
  flagReason: (v) => ['flag_reason', common.text(v, 500)],
  rejectionReason: (v) => ['rejection_reason', common.text(v)],
  infoRequestMessage: (v) => ['info_request_message', common.text(v)],
  blurFaces: (v) => ['blur_faces', common.flag(v)],
  showFullNames: (v) => ['show_full_names', common.flag(v)],
};

// Saves any of the fields the pages send (the whole object, or just a few fields).
// `actor` is { userId, email } of the admin or of the orphanage itself.
async function save(id, body, actor) {
  const current = await db.one('SELECT * FROM orphanages WHERE id = ?', [id]);
  if (!current) return null;

  await db.tx(async () => {
    const sets = {};
    for (const [key, convert] of Object.entries(SCALARS)) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const [column, value] = convert(body[key]);
        sets[column] = value;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'storyLanguage')) {
      const language = common.text(body.storyLanguage);
      sets.story_language = language && ['en', 'fr'].includes(language) ? language : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'termsAgreed')) {
      sets.terms_accepted_at = body.termsAgreed ? (current.terms_accepted_at || db.sqlTime()) : null;
      sets.terms_version = body.termsAgreed ? '1' : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const status = STATUS_IN[body.status];
      if (!status) throw new HttpError(400, 'Unknown status.');
      sets.verification_status = status;
      if (status !== current.verification_status) {
        if (status !== 'draft' && !current.submitted_at) sets.submitted_at = db.sqlTime();
        if (['verified', 'rejected', 'needs_info'].includes(status)) {
          sets.decided_at = db.sqlTime();
          sets.decided_by = actor && actor.isAdmin ? actor.userId : null;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'submittedDate') && body.submittedDate && !sets.submitted_at && !current.submitted_at) {
      sets.submitted_at = db.sqlTime(body.submittedDate);
    }

    // A new photo can only be one of our own uploads.
    for (const [key, column] of [['photoUrl', 'profile_photo_upload_id'], ['coverPhotoUrl', 'cover_photo_upload_id']]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const uploadId = common.uploadIdFromUrl(body[key]);
        if (uploadId || !body[key]) sets[column] = uploadId;
      }
    }

    const columns = Object.keys(sets);
    if (columns.length > 0) {
      await db.run('UPDATE orphanages SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
    }

    await savePayment(id, current, body, actor);
    await saveAppeal(id, body, actor);
    if (Array.isArray(body.posts)) await savePosts(id, body.posts, actor);
    if (Object.prototype.hasOwnProperty.call(body, 'activityLog')) {
      await common.syncActivity('orphanage', id, body.activityLog, actor && actor.userId);
    }
  });

  return get(id);
}

async function savePayment(id, current, body, actor) {
  const touched = ['paymentProvider', 'paymentAccountName', 'paymentAccountNumber', 'paymentAccountConfirmed']
    .some((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (!touched) return;

  const existing = await db.one(
    `SELECT a.*, m.name AS method_name FROM orphanage_payment_accounts a
     JOIN payment_methods m ON m.id = a.payment_method_id WHERE a.orphanage_id = ? ORDER BY a.id DESC LIMIT 1`, [id]);
  const pick = (key, old) => (Object.prototype.hasOwnProperty.call(body, key) ? common.text(body[key], 120) : old);
  // A listed method (MTN Mobile Money...) is stored as the method itself, so keep it when only other fields change.
  const provider = pick('paymentProvider', existing ? (existing.provider_name || existing.method_name) : null);
  const holder = pick('paymentAccountName', existing ? existing.account_holder : null);
  const number = pick('paymentAccountNumber', existing ? existing.account_number : null);

  if (!number) {
    if (existing) await db.run('DELETE FROM orphanage_payment_accounts WHERE id = ?', [existing.id]);
    return;
  }

  const methodId = await common.paymentMethodId(provider) || (await common.paymentMethodId('Other'));
  const known = await db.one('SELECT id FROM payment_methods WHERE name = ?', [provider || '']);
  const providerName = known ? null : (provider ? provider.slice(0, 80) : null);
  const confirmed = Object.prototype.hasOwnProperty.call(body, 'paymentAccountConfirmed')
    ? Boolean(body.paymentAccountConfirmed) : Boolean(existing && existing.confirmed_at);

  const values = {
    payment_method_id: methodId,
    provider_name: providerName,
    account_holder: holder || '',
    account_number: String(number).slice(0, 60),
    confirmed_at: confirmed ? ((existing && existing.confirmed_at) || db.sqlTime()) : null,
    confirmed_by: confirmed ? ((existing && existing.confirmed_by) || (actor && actor.isAdmin ? actor.userId : null)) : null,
  };
  if (existing) {
    const columns = Object.keys(values);
    await db.run('UPDATE orphanage_payment_accounts SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => values[c]), existing.id]);
  } else {
    const columns = ['orphanage_id', ...Object.keys(values)];
    await db.run('INSERT INTO orphanage_payment_accounts (' + columns.join(', ') + ') VALUES (' + columns.map(() => '?').join(', ') + ')', [id, ...Object.keys(values).map((c) => values[c])]);
  }
}

// An appeal is the orphanage's second-look request after a rejection.
async function saveAppeal(id, body, actor) {
  if (!Object.prototype.hasOwnProperty.call(body, 'appealMessage')) return;
  const message = common.text(body.appealMessage);
  const open = await db.one("SELECT id, message FROM appeals WHERE subject_type = 'orphanage' AND subject_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [id]);
  if (message && (!open || open.message !== message)) {
    await db.run("INSERT INTO appeals (subject_type, subject_id, message, created_at) VALUES ('orphanage', ?, ?, ?)", [id, message, db.sqlTime(body.appealDate)]);
  } else if (!message && open) {
    await db.run("UPDATE appeals SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ?", [actor && actor.isAdmin ? actor.userId : null, db.sqlTime(), open.id]);
  }
}

// Posts an admin removed are hidden, not erased.
async function savePosts(id, incoming, actor) {
  const visible = await db.q('SELECT id, body, created_at FROM orphanage_posts WHERE orphanage_id = ? AND hidden_at IS NULL ORDER BY id', [id]);
  const byId = incoming.every((p) => p && p.id);
  const keepIds = new Set(incoming.map((p) => p && Number(p.id)));
  const wanted = incoming.map((p) => (p && p.text) + '|' + (p && p.date));
  for (const row of visible) {
    let keep;
    if (byId) {
      keep = keepIds.has(row.id);
    } else {
      const at = wanted.indexOf(row.body + '|' + db.dateOnly(row.created_at));
      keep = at !== -1;
      if (keep) wanted[at] = null;
    }
    if (!keep) {
      await db.run('UPDATE orphanage_posts SET hidden_at = ?, hidden_by = ? WHERE id = ?', [db.sqlTime(), actor && actor.isAdmin ? actor.userId : null, row.id]);
    }
  }
}

async function remove(id) {
  const result = await db.run('DELETE FROM orphanages WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// The portal's own submit step: draft / needs-info -> pending.
async function markSubmitted(id, status, reviewerEmail, ownerUserId) {
  await db.run("UPDATE orphanages SET verification_status = 'pending', submitted_at = ? WHERE id = ?", [db.sqlTime(), id]);
  await common.logActivity('orphanage', id, status === 'needs-info' ? 'Resubmitted with the requested information' : 'Submitted for verification', reviewerEmail, ownerUserId);
}

// ---- documents and photos -----------------------------------------------------

async function attachDocument(orphanageId, uploadId) {
  await db.run('INSERT INTO verification_documents (upload_id, orphanage_id) VALUES (?, ?)', [uploadId, orphanageId]);
}

async function setPhoto(orphanageId, column, uploadId) {
  await db.run('UPDATE orphanages SET ' + column + ' = ? WHERE id = ?', [uploadId, orphanageId]);
}

module.exports = {
  STATUS_OUT, list, get, getByOwner, listed, getListed, getVerified, ensureForUser, createByAdmin, save, remove,
  markSubmitted, attachDocument, setPhoto,
};
