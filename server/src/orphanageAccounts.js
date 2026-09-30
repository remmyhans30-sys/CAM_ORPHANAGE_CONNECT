const db = require('./db');

// Every orphanage sign-up gets a pending orphanage record so it shows up in the
// admin verification queue. Also covers accounts created before this existed.
function ensureOrphanageForUser(user) {
  const existing = db.prepare('SELECT * FROM orphanages WHERE user_id = ?').get(user.id);
  if (existing) return existing;

  const activityLog = [{ action: 'Signed up', reviewer: user.email, timestamp: new Date().toISOString() }];
  const result = db
    .prepare(
      `INSERT INTO orphanages (name, contact_email, status, submitted_date, user_id, activity_log)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    )
    .run(user.fullname, user.email, new Date().toISOString().slice(0, 10), user.id, JSON.stringify(activityLog));

  return db.prepare('SELECT * FROM orphanages WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = { ensureOrphanageForUser };
