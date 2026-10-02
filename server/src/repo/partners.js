const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');
const donations = require('./donations');
const donors = require('./donors');
const emailConfirmation = require('../emailConfirmation');

// Partner organizations as the pages see them. The login lives in users (role partner), the
// organization in partner_organizations, with documents, pledges, sponsorships and referrals
// in their own tables. A partner's id is the partner_organizations id.

const STATUS_OUT = { draft: 'draft', pending: 'pending', needs_info: 'needs-info', verified: 'verified', rejected: 'rejected' };
const STATUS_IN = { draft: 'draft', pending: 'pending', 'needs-info': 'needs_info', needs_info: 'needs_info', verified: 'verified', rejected: 'rejected' };
const TIER_OUT = { sponsor: 'Sponsor', verified_referrer: 'Verified Referrer' };
const TIER_IN = { Sponsor: 'sponsor', 'Verified Referrer': 'verified_referrer' };
const CASE_OUT = { pending: 'pending', accepted: 'reviewed', declined: 'reviewed', placed: 'reviewed', closed: 'reviewed' };

const BASE = `
  SELECT p.*, u.email, u.status AS login_status, t.name AS org_type,
         u.email_verified_at, LEFT(u.password_hash, 10) = '${emailConfirmation.NO_LOGIN}' AS no_login
  FROM partner_organizations p
  JOIN users u ON u.id = p.owner_user_id
  LEFT JOIN organization_types t ON t.id = p.organization_type_id`;

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const owners = rows.map((r) => r.owner_user_id);

  const documents = await common.documentsFor('partner_id', ids);
  const activity = await common.activityFor('partner', ids);
  const gifts = await donations.forGivers(owners);

  const pledges = new Map();
  (await db.q('SELECT * FROM matching_pledges WHERE partner_id IN (?) ORDER BY id', [ids])).forEach((r) => pledges.set(r.partner_id, r));

  const cases = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT * FROM placement_referrals WHERE partner_id IN (?) ORDER BY id', [ids])).forEach((r) => cases.get(r.partner_id).push({
    id: r.id,
    submittedDate: db.dateOnly(r.created_at),
    status: CASE_OUT[r.status],
    socialWorkerName: r.social_worker_name,
    socialWorkerPhone: r.social_worker_phone || '',
    reasonForReferral: r.reason_for_referral,
    placementType: r.placement_type || '',
    educationalStatus: r.educational_status || '',
    livingEnvironmentNotes: r.living_environment_notes || '',
    anticipatedDischargeDate: db.dateOnly(r.anticipated_discharge_on) || '',
  }));

  const sponsored = new Map(ids.map((id) => [id, []]));
  (await db.q(
    `SELECT s.partner_id, s.started_on, o.id AS orphanage_id, o.name FROM partner_sponsorships s
     JOIN orphanages o ON o.id = s.orphanage_id WHERE s.partner_id IN (?) AND s.ended_on IS NULL ORDER BY s.started_on`, [ids]))
    .forEach((r) => sponsored.get(r.partner_id).push({ orphanageId: r.orphanage_id, name: r.name, sponsorSince: db.dateOnly(r.started_on) }));

  const favourites = new Map(owners.map((id) => [id, []]));
  (await db.q('SELECT user_id, orphanage_id FROM follows WHERE user_id IN (?) ORDER BY created_at', [owners]))
    .forEach((r) => favourites.get(r.user_id).push(r.orphanage_id));

  const appeals = new Map();
  (await db.q("SELECT subject_id, message, created_at FROM appeals WHERE subject_type = 'partner' AND status = 'open' AND subject_id IN (?) ORDER BY id", [ids]))
    .forEach((r) => appeals.set(r.subject_id, r));

  return rows.map((p) => {
    const all = gifts.get(p.owner_user_id);
    const counted = all.filter((g) => ['pledged', 'completed'].includes(g.status));
    const pledge = pledges.get(p.id);
    const appeal = appeals.get(p.id);
    return {
      id: p.id,
      name: p.name,
      contactName: p.contact_name,
      email: p.email,
      country: p.country,
      submittedDate: db.dateOnly(p.submitted_at),
      verificationStatus: STATUS_OUT[p.verification_status],
      orgType: p.org_type,
      tier: TIER_OUT[p.tier],
      status: p.is_flagged ? 'flagged' : (p.login_status === 'active' ? 'active' : p.login_status),
      flagReason: p.flag_reason,
      totalContributed: counted.reduce((sum, g) => sum + g.amount, 0),
      placementReferralsCount: cases.get(p.id).length,
      logoUrl: common.photoUrlOf(p.logo_upload_id),
      sponsoredByBlurb: p.sponsored_by_blurb,
      wordingApproved: Boolean(p.blurb_approved),
      sanctionsScreened: Boolean(p.sanctions_screened_at),
      infoRequestMessage: p.info_request_message,
      rejectionReason: p.rejection_reason,
      appealMessage: appeal ? appeal.message : null,
      appealDate: appeal ? db.dateOnly(appeal.created_at) : null,
      adminNotes: p.admin_notes,
      pledge: pledge ? { description: pledge.description, limit: Number(pledge.yearly_limit), used: Number(pledge.used_amount) } : null,
      orphanagesSponsored: sponsored.get(p.id).map((s) => ({
        name: s.name,
        sponsorSince: s.sponsorSince,
        amount: counted.filter((g) => g.orphanageId === s.orphanageId).reduce((sum, g) => sum + g.amount, 0),
      })),
      documents: documents.get(p.id),
      placementCases: cases.get(p.id),
      activityLog: activity.get(p.id),
      donations: all.filter((g) => g.status !== 'failed'),
      favoriteOrphanageIds: favourites.get(p.owner_user_id),
      termsAgreed: Boolean(p.terms_accepted_at),
      ownerUserId: p.owner_user_id,
      // Verification waits until the account's email address is confirmed (see emailConfirmation.js).
      emailConfirmed: Boolean(p.email_verified_at),
      needsEmailConfirmation: emailConfirmation.waiting(p.email_verified_at, Boolean(p.no_login)),
    };
  });
}

async function list() {
  return hydrate(await db.q(BASE + ' ORDER BY p.id DESC'));
}

async function get(id) {
  const rows = await hydrate(await db.q(BASE + ' WHERE p.id = ?', [id]));
  return rows[0] || null;
}

async function getByOwner(userId) {
  const rows = await hydrate(await db.q(BASE + ' WHERE p.owner_user_id = ?', [userId]));
  return rows[0] || null;
}

async function getByEmail(email) {
  const rows = await hydrate(await db.q(BASE + ' WHERE u.email = ?', [String(email).trim().toLowerCase()]));
  return rows[0] || null;
}

async function verifiedList() {
  return hydrate(await db.q(BASE + " WHERE p.verification_status = 'verified' ORDER BY p.name"));
}

// A partner signing up: the login and the (still empty, draft) organization.
async function register({ name, email, passwordHash }) {
  return db.tx(async () => {
    const user = await db.run("INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, 'partner', ?)", [email, passwordHash, name.slice(0, 150)]);
    const org = await db.run("INSERT INTO partner_organizations (owner_user_id, name, verification_status, tier) VALUES (?, ?, 'draft', 'sponsor')", [user.insertId, name.slice(0, 200)]);
    await common.logActivity('partner', org.insertId, 'Signed up', name + ' (partner self-service)', user.insertId);
    return org.insertId;
  });
}

async function createByAdmin(body) {
  const name = String(body.name).trim();
  const owner = await common.createPlaceholderUser('partner', name, body.email);
  const result = await db.run("INSERT INTO partner_organizations (owner_user_id, name, verification_status) VALUES (?, ?, 'draft')", [owner, name.slice(0, 200)]);
  return result.insertId;
}

async function orgTypeId(name) {
  if (!name) return null;
  const row = await db.one('SELECT id FROM organization_types WHERE name = ?', [String(name)]);
  return row ? row.id : null;
}

async function save(id, body, actor) {
  const current = await db.one('SELECT * FROM partner_organizations WHERE id = ?', [id]);
  if (!current) return null;
  if (body.verificationStatus !== undefined && STATUS_IN[body.verificationStatus] === 'verified' && current.verification_status !== 'verified') {
    await emailConfirmation.checkBeforeApproval(current.owner_user_id, 'partner');
  }

  await db.tx(async () => {
    const sets = {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw new HttpError(400, 'Name is required.');
      sets.name = name.slice(0, 200);
    }
    if (body.contactName !== undefined) sets.contact_name = common.text(body.contactName, 120);
    if (body.country !== undefined) sets.country = common.text(body.country, 100);
    if (body.orgType !== undefined) sets.organization_type_id = await orgTypeId(body.orgType);
    if (body.tier !== undefined && TIER_IN[body.tier]) sets.tier = TIER_IN[body.tier];
    if (body.sponsoredByBlurb !== undefined) sets.sponsored_by_blurb = common.text(body.sponsoredByBlurb, 400);
    if (body.wordingApproved !== undefined) sets.blurb_approved = common.flag(body.wordingApproved);
    if (body.infoRequestMessage !== undefined) sets.info_request_message = common.text(body.infoRequestMessage);
    if (body.rejectionReason !== undefined) sets.rejection_reason = common.text(body.rejectionReason);
    if (body.flagReason !== undefined) sets.flag_reason = common.text(body.flagReason, 500);
    if (body.adminNotes !== undefined) sets.admin_notes = common.text(body.adminNotes);
    if (body.status !== undefined) sets.is_flagged = body.status === 'flagged' ? 1 : 0;

    if (body.termsAgreed !== undefined) {
      sets.terms_accepted_at = body.termsAgreed ? (current.terms_accepted_at || db.sqlTime()) : null;
      sets.terms_version = body.termsAgreed ? '1' : null;
    }
    if (body.sanctionsScreened !== undefined) {
      sets.sanctions_screened_at = body.sanctionsScreened ? (current.sanctions_screened_at || db.sqlTime()) : null;
      sets.sanctions_screened_by = body.sanctionsScreened ? (current.sanctions_screened_by || (actor && actor.isAdmin ? actor.userId : null)) : null;
    }
    if (body.logoUrl !== undefined) {
      const uploadId = common.uploadIdFromUrl(body.logoUrl);
      if (uploadId || !body.logoUrl) sets.logo_upload_id = uploadId;
    }
    if (body.verificationStatus !== undefined) {
      const status = STATUS_IN[body.verificationStatus];
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
    if (body.submittedDate && !current.submitted_at && !sets.submitted_at) sets.submitted_at = db.sqlTime(body.submittedDate);

    const columns = Object.keys(sets);
    if (columns.length > 0) {
      await db.run('UPDATE partner_organizations SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
    }

    if (body.email !== undefined && body.email && String(body.email).trim().toLowerCase()) {
      await db.run('UPDATE users SET email = ? WHERE id = ?', [String(body.email).trim().toLowerCase(), current.owner_user_id]);
    }
    if (body.name !== undefined) await db.run('UPDATE users SET display_name = ? WHERE id = ?', [sets.name.slice(0, 150), current.owner_user_id]);

    if (Object.prototype.hasOwnProperty.call(body, 'pledge')) await savePledge(id, body.pledge, actor);
    if (Array.isArray(body.orphanagesSponsored)) await saveSponsorships(id, body.orphanagesSponsored);
    if (Array.isArray(body.placementCases)) await saveCases(id, body.placementCases, actor);
    if (Array.isArray(body.donations)) await donors.saveDonations(current.owner_user_id, body.donations);
    if (Object.prototype.hasOwnProperty.call(body, 'appealMessage')) await saveAppeal(id, body, actor);
    if (Object.prototype.hasOwnProperty.call(body, 'activityLog')) {
      await common.syncActivity('partner', id, body.activityLog, actor && actor.userId);
    }
  });

  return get(id);
}

async function savePledge(partnerId, pledge, actor) {
  const existing = await db.one('SELECT * FROM matching_pledges WHERE partner_id = ? ORDER BY id DESC LIMIT 1', [partnerId]);
  if (!pledge || !pledge.description) {
    if (existing) await db.run('DELETE FROM matching_pledges WHERE id = ?', [existing.id]);
    return;
  }
  const limit = Math.max(1, Math.trunc(Number(pledge.limit)) || 1);
  const used = Math.min(limit, Math.max(0, Math.trunc(Number(pledge.used)) || 0));
  const description = String(pledge.description).trim().slice(0, 400);
  if (existing) {
    await db.run('UPDATE matching_pledges SET description = ?, yearly_limit = ?, used_amount = ? WHERE id = ?', [description, limit, used, existing.id]);
  } else {
    await db.run('INSERT INTO matching_pledges (partner_id, description, yearly_limit, used_amount) VALUES (?, ?, ?, ?)', [partnerId, description, limit, used]);
  }
}

async function saveSponsorships(partnerId, incoming) {
  const keep = [];
  for (const entry of incoming) {
    if (!entry || !entry.name) continue;
    const orphanage = await db.one('SELECT id FROM orphanages WHERE name = ? ORDER BY id LIMIT 1', [String(entry.name)]);
    if (!orphanage) continue;
    keep.push(orphanage.id);
    await db.run(
      'INSERT INTO partner_sponsorships (partner_id, orphanage_id, started_on) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ended_on = NULL',
      [partnerId, orphanage.id, db.dateOnly(entry.sponsorSince) || db.dateOnly(db.sqlTime())]
    );
  }
  const stored = await db.q('SELECT orphanage_id FROM partner_sponsorships WHERE partner_id = ? AND ended_on IS NULL', [partnerId]);
  for (const row of stored) {
    if (!keep.includes(row.orphanage_id)) {
      await db.run('UPDATE partner_sponsorships SET ended_on = GREATEST(started_on, CURRENT_DATE) WHERE partner_id = ? AND orphanage_id = ?', [partnerId, row.orphanage_id]);
    }
  }
}

async function saveCases(partnerId, incoming, actor) {
  for (const entry of incoming) {
    if (!entry || !entry.id) continue;
    const row = await db.one('SELECT status FROM placement_referrals WHERE id = ? AND partner_id = ?', [entry.id, partnerId]);
    if (row && entry.status === 'reviewed' && row.status === 'pending') {
      await db.run("UPDATE placement_referrals SET status = 'accepted', reviewed_by = ?, reviewed_at = ? WHERE id = ?", [actor && actor.isAdmin ? actor.userId : null, db.sqlTime(), entry.id]);
    }
  }
}

async function saveAppeal(partnerId, body, actor) {
  const message = common.text(body.appealMessage);
  const open = await db.one("SELECT id, message FROM appeals WHERE subject_type = 'partner' AND subject_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [partnerId]);
  if (message && (!open || open.message !== message)) {
    await db.run("INSERT INTO appeals (subject_type, subject_id, message, created_at) VALUES ('partner', ?, ?, ?)", [partnerId, message, db.sqlTime(body.appealDate)]);
  } else if (!message && open) {
    await db.run("UPDATE appeals SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ?", [actor && actor.isAdmin ? actor.userId : null, db.sqlTime(), open.id]);
  }
}

async function remove(id) {
  const org = await db.one('SELECT owner_user_id FROM partner_organizations WHERE id = ?', [id]);
  if (!org) return false;
  await db.tx(async () => {
    await db.run('DELETE FROM partner_organizations WHERE id = ?', [id]);
    await db.run("DELETE FROM users WHERE id = ? AND role = 'partner'", [org.owner_user_id]);
  });
  return true;
}

// ---- partner self-service helpers -----------------------------------------------

async function submit(partner, reviewerName) {
  await db.run("UPDATE partner_organizations SET verification_status = 'pending', submitted_at = ? WHERE id = ?", [db.sqlTime(), partner.id]);
  await common.logActivity('partner', partner.id,
    partner.verificationStatus === 'needs-info' ? 'Resubmitted with the requested information' : 'Submitted for verification',
    reviewerName + ' (partner self-service)', partner.ownerUserId);
}

async function attachDocument(partnerId, uploadId) {
  await db.run('INSERT INTO verification_documents (upload_id, partner_id) VALUES (?, ?)', [uploadId, partnerId]);
}

async function addPlacementCase(partnerId, c) {
  await db.run(
    `INSERT INTO placement_referrals (partner_id, social_worker_name, social_worker_phone, reason_for_referral, placement_type,
                                      educational_status, living_environment_notes, anticipated_discharge_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [partnerId, c.socialWorkerName, common.text(c.socialWorkerPhone, 40), c.reasonForReferral, common.text(c.placementType, 100),
      common.text(c.educationalStatus, 150), common.text(c.livingEnvironmentNotes), /^\d{4}-\d{2}-\d{2}$/.test(c.anticipatedDischargeDate || '') ? c.anticipatedDischargeDate : null]
  );
}

// Marks that a partner now supports an orphanage (created on the first gift).
async function noteSponsorship(partnerId, orphanageId, date) {
  await db.run(
    'INSERT INTO partner_sponsorships (partner_id, orphanage_id, started_on) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ended_on = NULL',
    [partnerId, orphanageId, db.dateOnly(db.sqlTime(date))]
  );
}

async function toggleFavourite(userId, orphanageId) {
  const removed = await db.run('DELETE FROM follows WHERE user_id = ? AND orphanage_id = ?', [userId, orphanageId]);
  if (removed.affectedRows === 0) await db.run('INSERT INTO follows (user_id, orphanage_id) VALUES (?, ?)', [userId, orphanageId]);
}

module.exports = {
  STATUS_OUT, list, get, getByOwner, getByEmail, verifiedList, register, createByAdmin, save, remove,
  submit, attachDocument, addPlacementCase, noteSponsorship, toggleFavourite, orgTypeId,
};
