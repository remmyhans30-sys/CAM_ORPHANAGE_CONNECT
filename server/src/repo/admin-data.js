const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');
const support = require('./support');

// Programs, abuse reports, organization settings and admin accounts.

// ---- programs -----------------------------------------------------------------

const programs = {
  async hydrate(rows) {
    if (rows.length === 0) return [];
    const items = new Map(rows.map((r) => [r.id, { objective: [], activity: [] }]));
    (await db.q('SELECT program_id, kind, content FROM program_items WHERE program_id IN (?) ORDER BY sort_order, id', [rows.map((r) => r.id)]))
      .forEach((i) => items.get(i.program_id)[i.kind].push(i.content));
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category_name,
      status: p.status,
      description: p.description,
      fundingGoal: Number(p.funding_goal),
      amountRaised: Number(p.raised_amount),
      childrenBenefiting: p.children_benefiting,
      objectives: items.get(p.id).objective.join('\n'),
      activities: items.get(p.id).activity.join('\n'),
    }));
  },
  BASE: 'SELECT p.*, c.name AS category_name FROM programs p LEFT JOIN categories c ON c.id = p.category_id',
  async list() { return this.hydrate(await db.q(this.BASE + ' ORDER BY p.id DESC')); },
  async get(id) { return (await this.hydrate(await db.q(this.BASE + ' WHERE p.id = ?', [id])))[0] || null; },

  async categoryId(name) {
    const clean = common.text(name, 60);
    if (!clean) return null;
    const found = await db.one('SELECT id FROM categories WHERE name = ?', [clean]);
    if (found) return found.id;
    return (await db.run('INSERT INTO categories (name) VALUES (?)', [clean])).insertId;
  },

  async setItems(programId, kind, textValue) {
    await db.run('DELETE FROM program_items WHERE program_id = ? AND kind = ?', [programId, kind]);
    const lines = String(textValue || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      await db.run('INSERT INTO program_items (program_id, kind, content, sort_order) VALUES (?, ?, ?, ?)', [programId, kind, lines[i].slice(0, 500), i]);
    }
  },

  async write(id, body, actorUserId) {
    const sets = {};
    if (body.name !== undefined) sets.name = String(body.name).trim().slice(0, 200);
    if (body.category !== undefined) sets.category_id = await this.categoryId(body.category);
    if (body.status !== undefined) {
      if (!['planned', 'active', 'completed'].includes(body.status)) throw new HttpError(400, 'Status must be planned, active or completed.');
      sets.status = body.status;
    }
    if (body.description !== undefined) sets.description = common.text(body.description);
    if (body.fundingGoal !== undefined) sets.funding_goal = Math.max(0, common.whole(body.fundingGoal) || 0);
    if (body.amountRaised !== undefined) sets.raised_amount = Math.max(0, common.whole(body.amountRaised) || 0);
    if (body.childrenBenefiting !== undefined) sets.children_benefiting = Math.max(0, common.whole(body.childrenBenefiting) || 0);
    if (id === null) {
      sets.created_by = actorUserId || null;
      const columns = Object.keys(sets);
      id = (await db.run('INSERT INTO programs (' + columns.join(', ') + ') VALUES (' + columns.map(() => '?').join(', ') + ')', columns.map((c) => sets[c]))).insertId;
    } else {
      const columns = Object.keys(sets);
      if (columns.length > 0) await db.run('UPDATE programs SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
    }
    if (body.objectives !== undefined) await this.setItems(id, 'objective', body.objectives);
    if (body.activities !== undefined) await this.setItems(id, 'activity', body.activities);
    return id;
  },

  async create(body, actorUserId) { return db.tx(async () => this.get(await this.write(null, body, actorUserId))); },
  async update(id, body) {
    if (!(await db.one('SELECT id FROM programs WHERE id = ?', [id]))) return null;
    return db.tx(async () => { await this.write(id, body); return this.get(id); });
  },
  async remove(id) { return (await db.run('DELETE FROM programs WHERE id = ?', [id])).affectedRows > 0; },
};

// ---- abuse reports --------------------------------------------------------------

const REASONS = {
  'Fake profile': 'fake_profile', 'Inappropriate content': 'inappropriate_content', Harassment: 'harassment',
  Fraud: 'fraud', 'Child safety': 'child_safety', Other: 'other',
};
const REASONS_OUT = Object.fromEntries(Object.entries(REASONS).map(([label, code]) => [code, label]));
const REPORT_STATUS_IN = { open: 'open', investigating: 'investigating', resolved: 'resolved', dismissed: 'dismissed' };

const reports = {
  BASE: `SELECT r.*, u.role AS reported_role, u.display_name AS reported_name, o.id AS orphanage_id, p.id AS partner_id
         FROM abuse_reports r JOIN users u ON u.id = r.reported_user_id
         LEFT JOIN orphanages o ON o.owner_user_id = u.id LEFT JOIN partner_organizations p ON p.owner_user_id = u.id`,
  toReport(r) {
    const type = r.reported_role === 'donor' ? 'donor' : r.reported_role;
    return {
      id: r.id,
      reporterName: r.reporter_name,
      reporterAccountType: r.reporter_account_type,
      reportedAccountType: type,
      reportedAccountId: type === 'orphanage' ? r.orphanage_id : (type === 'partner' ? r.partner_id : r.reported_user_id),
      reportedAccountName: r.reported_name,
      reasonCategory: REASONS_OUT[r.reason_category] || 'Other',
      details: r.details,
      timestamp: db.isoTime(r.created_at),
      status: r.status,
      resolution: r.resolution,
    };
  },
  async list() { return (await db.q(this.BASE + ' ORDER BY r.id DESC')).map((r) => this.toReport(r)); },
  async get(id) { const r = await db.one(this.BASE + ' WHERE r.id = ?', [id]); return r ? this.toReport(r) : null; },

  async create(body) {
    const reportedUser = await support.userIdFor(body.reportedAccountType, body.reportedAccountId);
    if (!reportedUser) throw new HttpError(400, 'The reported account does not exist.');
    const result = await db.run(
      `INSERT INTO abuse_reports (reporter_name, reporter_account_type, reported_user_id, reason_category, details, status, resolution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [common.text(body.reporterName, 150), common.text(body.reporterAccountType, 20), reportedUser, REASONS[body.reasonCategory] || 'other',
        common.text(body.details), REPORT_STATUS_IN[body.status] || 'open', common.text(body.resolution), db.sqlTime(body.timestamp)]
    );
    return this.get(result.insertId);
  },

  async update(id, body, actorUserId) {
    const current = await db.one('SELECT id, status FROM abuse_reports WHERE id = ?', [id]);
    if (!current) return null;
    const sets = {};
    if (body.status !== undefined && REPORT_STATUS_IN[body.status]) {
      sets.status = body.status;
      if (['resolved', 'dismissed'].includes(body.status) && current.status !== body.status) {
        sets.resolved_by = actorUserId || null;
        sets.resolved_at = db.sqlTime();
      }
    }
    if (body.resolution !== undefined) sets.resolution = common.text(body.resolution);
    if (body.details !== undefined) sets.details = common.text(body.details);
    if (body.reasonCategory !== undefined) sets.reason_category = REASONS[body.reasonCategory] || 'other';
    const columns = Object.keys(sets);
    if (columns.length > 0) await db.run('UPDATE abuse_reports SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
    return this.get(id);
  },
  async remove(id) { return (await db.run('DELETE FROM abuse_reports WHERE id = ?', [id])).affectedRows > 0; },
};

// ---- organization settings --------------------------------------------------------

const CURRENCY_OUT = { XAF: 'FCFA', EUR: 'EUR', USD: 'USD' };
const CURRENCY_IN = { FCFA: 'XAF', XAF: 'XAF', EUR: 'EUR', USD: 'USD' };

const settings = {
  async row() {
    let row = await db.one('SELECT * FROM organization_settings WHERE id = 1');
    if (!row) {
      await db.run('INSERT INTO organization_settings (id) VALUES (1)');
      row = await db.one('SELECT * FROM organization_settings WHERE id = 1');
    }
    return row;
  },
  async get() {
    const r = await this.row();
    return {
      orgName: r.org_name, orgEmail: r.org_email, orgPhone: r.org_phone, orgAddress: r.org_address, orgDescription: r.org_description,
      currency: CURRENCY_OUT[r.default_currency] || 'FCFA',
      notifEmail: Boolean(r.notify_email), notifDonations: Boolean(r.notify_donations), notifMessages: Boolean(r.notify_messages),
    };
  },
  async update(body, actorUserId) {
    await this.row();
    const sets = {};
    if (body.orgName !== undefined) sets.org_name = String(body.orgName || '').trim().slice(0, 150) || 'CAM Orphanage Connect';
    if (body.orgEmail !== undefined) sets.org_email = common.text(body.orgEmail, 190);
    if (body.orgPhone !== undefined) sets.org_phone = common.text(body.orgPhone, 40);
    if (body.orgAddress !== undefined) sets.org_address = common.text(body.orgAddress, 255);
    if (body.orgDescription !== undefined) sets.org_description = common.text(body.orgDescription);
    if (body.currency !== undefined) sets.default_currency = CURRENCY_IN[body.currency] || 'XAF';
    if (body.notifEmail !== undefined) sets.notify_email = common.flag(body.notifEmail);
    if (body.notifDonations !== undefined) sets.notify_donations = common.flag(body.notifDonations);
    if (body.notifMessages !== undefined) sets.notify_messages = common.flag(body.notifMessages);
    const columns = Object.keys(sets);
    if (columns.length > 0) {
      sets.updated_by = actorUserId || null;
      columns.push('updated_by');
      await db.run('UPDATE organization_settings SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = 1', columns.map((c) => sets[c]));
    }
    return this.get();
  },
};

// ---- admin accounts ----------------------------------------------------------------

const admins = {
  BASE: `SELECT u.id, u.display_name, u.email, u.password_hash, r.name AS role
         FROM users u JOIN admin_profiles a ON a.user_id = u.id JOIN admin_roles r ON r.id = a.admin_role_id`,
  toAdmin: (r) => ({ id: r.id, name: r.display_name, email: r.email, role: r.role }),
  async list() { return (await db.q(this.BASE + ' ORDER BY u.id')).map(this.toAdmin); },
  async get(id) { const r = await db.one(this.BASE + ' WHERE u.id = ?', [id]); return r ? this.toAdmin(r) : null; },
  async byEmail(email) { return db.one(this.BASE + ' WHERE u.email = ?', [String(email).trim().toLowerCase()]); },
  async count() { return (await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")).n; },
  async roleId(name) {
    const r = await db.one('SELECT id FROM admin_roles WHERE name = ?', [name]);
    if (!r) throw new HttpError(400, 'Unknown role.');
    return r.id;
  },
  async create({ name, email, passwordHash, role }, createdBy) {
    return db.tx(async () => {
      const roleId = await this.roleId(role);
      const user = await db.run("INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, 'admin', ?)", [email, passwordHash, name.slice(0, 150)]);
      await db.run('INSERT INTO admin_profiles (user_id, admin_role_id, created_by) VALUES (?, ?, ?)', [user.insertId, roleId, createdBy || null]);
      return this.get(user.insertId);
    });
  },
  async update(id, { name, email, passwordHash, role }) {
    return db.tx(async () => {
      const sets = {};
      if (name !== undefined) sets.display_name = name.slice(0, 150);
      if (email !== undefined) sets.email = email;
      if (passwordHash) sets.password_hash = passwordHash;
      const columns = Object.keys(sets);
      if (columns.length > 0) await db.run('UPDATE users SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
      if (role !== undefined) await db.run('UPDATE admin_profiles SET admin_role_id = ? WHERE user_id = ?', [await this.roleId(role), id]);
      return this.get(id);
    });
  },
  async remove(id) { return (await db.run("DELETE FROM users WHERE id = ? AND role = 'admin'", [id])).affectedRows > 0; },
};

module.exports = { programs, reports, settings, admins };
