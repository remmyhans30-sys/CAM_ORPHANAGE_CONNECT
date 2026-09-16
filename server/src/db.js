const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'data.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Super Admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orphanages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    registration_number TEXT,
    story TEXT,
    story_language TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    children_count INTEGER DEFAULT 0,
    followers_count INTEGER DEFAULT 0,
    founded_year INTEGER,
    capacity INTEGER,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    terms_agreed INTEGER DEFAULT 0,
    photo_url TEXT,
    cover_photo_url TEXT,
    payment_provider TEXT,
    payment_account_name TEXT,
    payment_account_number TEXT,
    payment_account_confirmed INTEGER DEFAULT 0,
    flagged INTEGER DEFAULT 0,
    flag_reason TEXT,
    rejection_reason TEXT,
    appeal_message TEXT,
    appeal_date TEXT,
    info_request_message TEXT,
    submitted_date TEXT,
    blur_faces INTEGER DEFAULT 1,
    show_full_names INTEGER DEFAULT 0,
    documents TEXT NOT NULL DEFAULT '[]',
    gallery TEXT NOT NULL DEFAULT '[]',
    posts TEXT NOT NULL DEFAULT '[]',
    activity_log TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS donors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    join_date TEXT,
    location TEXT,
    preferred_payment TEXT,
    preferred_currency TEXT,
    last_active TEXT,
    vip INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    flag_reason TEXT,
    total_given INTEGER DEFAULT 0,
    donations_count INTEGER DEFAULT 0,
    homes_followed_count INTEGER DEFAULT 0,
    active_recurring_gifts INTEGER DEFAULT 0,
    chargebacks_count INTEGER DEFAULT 0,
    photo_url TEXT,
    referred_by TEXT,
    admin_notes TEXT,
    donations TEXT NOT NULL DEFAULT '[]',
    password_resets TEXT NOT NULL DEFAULT '[]',
    failed_payments TEXT NOT NULL DEFAULT '[]',
    support_tickets TEXT NOT NULL DEFAULT '[]',
    referrals_made TEXT NOT NULL DEFAULT '[]',
    homes_followed TEXT NOT NULL DEFAULT '[]',
    groups_joined TEXT NOT NULL DEFAULT '[]',
    activity_log TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    country TEXT,
    submitted_date TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    org_type TEXT,
    tier TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    flag_reason TEXT,
    total_contributed INTEGER DEFAULT 0,
    placement_referrals_count INTEGER DEFAULT 0,
    logo_url TEXT,
    sponsored_by_blurb TEXT,
    wording_approved INTEGER DEFAULT 0,
    sanctions_screened INTEGER DEFAULT 0,
    info_request_message TEXT,
    rejection_reason TEXT,
    appeal_message TEXT,
    appeal_date TEXT,
    admin_notes TEXT,
    pledge TEXT,
    orphanages_sponsored TEXT NOT NULL DEFAULT '[]',
    documents TEXT NOT NULL DEFAULT '[]',
    placement_cases TEXT NOT NULL DEFAULT '[]',
    activity_log TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT,
    funding_goal INTEGER DEFAULT 0,
    amount_raised INTEGER DEFAULT 0,
    children_benefiting INTEGER DEFAULT 0,
    objectives TEXT,
    activities TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS needs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orphanage_id INTEGER NOT NULL REFERENCES orphanages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    goal INTEGER DEFAULT 0,
    raised INTEGER DEFAULT 0,
    percent INTEGER DEFAULT 0,
    date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_name TEXT,
    account_type TEXT,
    account_id INTEGER,
    subject TEXT,
    body TEXT,
    timestamp TEXT,
    read INTEGER DEFAULT 0,
    from_admin INTEGER DEFAULT 0,
    auto_replied INTEGER DEFAULT 0,
    replies TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_name TEXT,
    reporter_account_type TEXT,
    reported_account_type TEXT,
    reported_account_id INTEGER,
    reported_account_name TEXT,
    reason_category TEXT,
    details TEXT,
    timestamp TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    org_name TEXT,
    org_email TEXT,
    org_phone TEXT,
    org_address TEXT,
    org_description TEXT,
    currency TEXT NOT NULL DEFAULT 'FCFA',
    notif_email INTEGER NOT NULL DEFAULT 1,
    notif_donations INTEGER NOT NULL DEFAULT 1,
    notif_messages INTEGER NOT NULL DEFAULT 1
  );
`);

module.exports = db;
