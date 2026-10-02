// Brings a database built before "updates, videos and social links" up to date.
// A fresh database already has all of this (see database/cam_orphanage_connect.sql).

async function columnExists(db, table, column) {
  const row = await db.one(
    'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  );
  return row.n > 0;
}

async function constraintExists(db, table, name) {
  const row = await db.one(
    'SELECT COUNT(*) AS n FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?',
    [table, name]
  );
  return row.n > 0;
}

module.exports = {
  name: '001-posts-videos-social',
  async up(db) {
    await db.run("ALTER TABLE uploads MODIFY purpose ENUM('document','photo','video') NOT NULL COMMENT 'documents are private, photos are public, videos are shown only to approved viewers'");
    if (await constraintExists(db, 'uploads', 'ck_uploads_size')) await db.run('ALTER TABLE uploads DROP CHECK ck_uploads_size');
    await db.run("ALTER TABLE uploads ADD CONSTRAINT ck_uploads_size CHECK (size_bytes > 0 AND ((purpose = 'video' AND size_bytes <= 20971520) OR (purpose <> 'video' AND size_bytes <= 3145728)))");

    if (!(await columnExists(db, 'orphanage_posts', 'post_type'))) {
      await db.run("ALTER TABLE orphanage_posts ADD COLUMN post_type ENUM('story','update','gift') NOT NULL DEFAULT 'update' COMMENT 'story, news update, or a thank-you for a gift the home received' AFTER orphanage_id");
    }
    if (!(await columnExists(db, 'orphanage_posts', 'title'))) {
      await db.run('ALTER TABLE orphanage_posts ADD COLUMN title VARCHAR(150) NULL AFTER post_type');
    }
    if (!(await columnExists(db, 'orphanage_posts', 'video_upload_id'))) {
      await db.run('ALTER TABLE orphanage_posts ADD COLUMN video_upload_id CHAR(32) NULL AFTER photo_upload_id');
      await db.run('ALTER TABLE orphanage_posts ADD CONSTRAINT fk_orphanage_posts_video FOREIGN KEY (video_upload_id) REFERENCES uploads (id) ON DELETE SET NULL');
    }
    if (!(await constraintExists(db, 'orphanage_posts', 'ck_orphanage_posts_body'))) {
      await db.run('ALTER TABLE orphanage_posts ADD CONSTRAINT ck_orphanage_posts_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 2000)');
    }

    await db.run(`CREATE TABLE IF NOT EXISTS orphanage_social_links (
      orphanage_id BIGINT UNSIGNED NOT NULL,
      platform     ENUM('website','facebook','instagram','youtube','tiktok','x','whatsapp') NOT NULL,
      url          VARCHAR(300) NOT NULL,
      PRIMARY KEY (orphanage_id, platform),
      CONSTRAINT ck_social_https CHECK (url LIKE 'https://%'),
      CONSTRAINT fk_social_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE
    ) ENGINE=InnoDB COMMENT='The orphanage''s own pages elsewhere, shown to approved donors and verified partners'`);

    await db.run('DROP TRIGGER IF EXISTS trg_posts_verified');
    await db.run(`CREATE TRIGGER trg_posts_verified BEFORE INSERT ON orphanage_posts FOR EACH ROW
      BEGIN
        IF IFNULL((SELECT verification_status FROM orphanages WHERE id = NEW.orphanage_id), '') <> 'verified' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a verified orphanage can post updates';
        END IF;
      END`);
  },
};
