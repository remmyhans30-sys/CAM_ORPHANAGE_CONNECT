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
`);

module.exports = db;
