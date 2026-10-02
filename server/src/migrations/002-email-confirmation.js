// Brings a database built before email confirmation up to date: a changed email address has to be
// confirmed again. A fresh database already has this (see database/cam_orphanage_connect.sql).

module.exports = {
  name: '002-email-confirmation',
  async up(db) {
    await db.run('DROP TRIGGER IF EXISTS trg_users_email_update');
    await db.run(`CREATE TRIGGER trg_users_email_update BEFORE UPDATE ON users FOR EACH ROW
      BEGIN
        SET NEW.email = LOWER(TRIM(NEW.email));
        IF CAST(NEW.email AS BINARY) <> CAST(OLD.email AS BINARY) THEN
          SET NEW.email_verified_at = NULL;
        END IF;
      END`);
  },
};
