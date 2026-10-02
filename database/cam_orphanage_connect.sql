-- =====================================================================================
--  CAM Orphanage Connect : MySQL database
--  Target: MySQL 8.0.16 or newer (uses CHECK constraints), InnoDB, utf8mb4.
--
--  How to run in MySQL Workbench:
--    1. File > Open SQL Script...  and choose this file.
--    2. Press the lightning-bolt button (Execute) with nothing selected, so the whole script runs.
--    3. In the Navigator, click the refresh icon next to SCHEMAS: cam_orphanage_connect appears.
--  Running it again is safe: it drops and rebuilds the database, so only use it on a fresh setup
--  or when you really want to start over.
--
--  Design rules
--    * One row per fact. No lists stored as text: messages, documents, activity and photos each
--      have their own table, so they can be searched, counted and protected by keys.
--    * One login table (users) for every kind of account, so an email can only ever belong to
--      one account. Each kind of account has a profile table with its own details.
--    * Money is stored as whole numbers (XAF has no cents).
--    * No personal details of individual children are stored anywhere. Only a head count.
--    * Times are stored in UTC.
-- =====================================================================================

DROP DATABASE IF EXISTS cam_orphanage_connect;
CREATE DATABASE cam_orphanage_connect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE cam_orphanage_connect;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================================
-- 1. REFERENCE LISTS (small tables the admin can extend, used by drop-downs)
-- =====================================================================================

CREATE TABLE regions (
  id    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(60) NOT NULL,
  code  VARCHAR(4)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_regions_name (name),
  UNIQUE KEY uq_regions_code (code)
) ENGINE=InnoDB COMMENT='The ten regions of Cameroon';

CREATE TABLE languages (
  code  CHAR(2)     NOT NULL,
  name  VARCHAR(40) NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB COMMENT='Languages an orphanage can tell its story in';

CREATE TABLE currencies (
  code   CHAR(3)     NOT NULL,
  name   VARCHAR(60) NOT NULL,
  symbol VARCHAR(8)  NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE payment_methods (
  id        TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(60) NOT NULL,
  kind      ENUM('mobile_money','card','bank_transfer','other') NOT NULL DEFAULT 'other',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_methods_name (name)
) ENGINE=InnoDB;

CREATE TABLE organization_types (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organization_types_name (name)
) ENGINE=InnoDB COMMENT='NGO, company, diaspora association and so on (for partners)';

CREATE TABLE categories (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB COMMENT='What a need or a program is about (education, health ...)';

CREATE TABLE admin_roles (
  id               TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(40)  NOT NULL,
  description      VARCHAR(255) NULL,
  can_manage_users TINYINT(1) NOT NULL DEFAULT 0,
  can_see_finance  TINYINT(1) NOT NULL DEFAULT 0,
  can_verify       TINYINT(1) NOT NULL DEFAULT 0,
  can_moderate     TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_roles_name (name)
) ENGINE=InnoDB COMMENT='What each kind of admin is allowed to do';

-- =====================================================================================
-- 2. ACCOUNTS: one login table for everyone, plus a profile table per kind of account
-- =====================================================================================

CREATE TABLE users (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email               VARCHAR(190) NOT NULL,
  password_hash       VARCHAR(255) NOT NULL COMMENT 'bcrypt hash, never the password itself',
  role                ENUM('admin','donor','orphanage','partner') NOT NULL,
  display_name        VARCHAR(150) NOT NULL,
  phone               VARCHAR(40)  NULL,
  status              ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  email_verified_at   DATETIME NULL,
  last_login_at       DATETIME NULL,
  failed_login_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role_status (role, status)
) ENGINE=InnoDB COMMENT='Every login: admins, donors, orphanages and partners';

CREATE TABLE uploads (
  id             CHAR(32) NOT NULL COMMENT 'random hex id, also the file name on disk',
  owner_user_id  BIGINT UNSIGNED NOT NULL,
  purpose        ENUM('document','photo') NOT NULL COMMENT 'documents are private, photos are public',
  original_name  VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  sha256         CHAR(64) NULL COMMENT 'fingerprint, to spot duplicate files',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_uploads_owner (owner_user_id),
  KEY ix_uploads_sha256 (sha256),
  CONSTRAINT ck_uploads_size CHECK (size_bytes > 0 AND size_bytes <= 3145728),
  CONSTRAINT fk_uploads_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Metadata of every uploaded file (the files themselves stay on disk)';

CREATE TABLE admin_profiles (
  user_id       BIGINT UNSIGNED NOT NULL,
  admin_role_id TINYINT UNSIGNED NOT NULL,
  created_by    BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_admin_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_profiles_role FOREIGN KEY (admin_role_id) REFERENCES admin_roles (id),
  CONSTRAINT fk_admin_profiles_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE donor_profiles (
  user_id                     BIGINT UNSIGNED NOT NULL,
  location_text               VARCHAR(150) NULL COMMENT 'where the donor lives, as typed ("Douala" or "Paris, France")',
  preferred_payment_method_id TINYINT UNSIGNED NULL,
  preferred_currency          CHAR(3) NOT NULL DEFAULT 'XAF',
  photo_upload_id             CHAR(32) NULL,
  referral_source             VARCHAR(120) NULL COMMENT 'how they heard about us',
  referred_by_user_id         BIGINT UNSIGNED NULL,
  is_vip                      TINYINT(1) NOT NULL DEFAULT 0,
  approval_status             ENUM('pending','active','flagged','rejected') NOT NULL DEFAULT 'pending',
  status_reason               VARCHAR(500) NULL COMMENT 'why a donor was flagged or rejected',
  decided_by                  BIGINT UNSIGNED NULL,
  decided_at                  DATETIME NULL,
  admin_notes                 TEXT NULL,
  last_active_at              DATETIME NULL,
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_donor_profiles_status (approval_status),
  CONSTRAINT fk_donor_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_donor_profiles_payment FOREIGN KEY (preferred_payment_method_id) REFERENCES payment_methods (id) ON DELETE SET NULL,
  CONSTRAINT fk_donor_profiles_currency FOREIGN KEY (preferred_currency) REFERENCES currencies (code),
  CONSTRAINT fk_donor_profiles_photo FOREIGN KEY (photo_upload_id) REFERENCES uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_donor_profiles_referrer FOREIGN KEY (referred_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_donor_profiles_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Donor details. Only active donors may browse orphanages and give';

-- =====================================================================================
-- 3. ORPHANAGES
-- =====================================================================================

CREATE TABLE orphanages (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id           BIGINT UNSIGNED NOT NULL COMMENT 'the login that manages this orphanage',
  name                    VARCHAR(200) NOT NULL,
  registration_number     VARCHAR(80)  NULL COMMENT 'official registration number, required before verification',
  region_id               TINYINT UNSIGNED NULL,
  city                    VARCHAR(150) NULL COMMENT 'where the home is, as the orphanage typed it (town, region)',
  address                 VARCHAR(255) NULL,
  story                   TEXT NULL,
  story_language          CHAR(2) NULL,
  founded_year            SMALLINT UNSIGNED NULL,
  capacity                SMALLINT UNSIGNED NULL,
  children_count          SMALLINT UNSIGNED NULL COMMENT 'a head count only; no child is ever identified',
  contact_name            VARCHAR(120) NULL,
  contact_phone           VARCHAR(40)  NULL,
  contact_email           VARCHAR(190) NULL,
  profile_photo_upload_id CHAR(32) NULL,
  cover_photo_upload_id   CHAR(32) NULL,
  verification_status     ENUM('draft','pending','needs_info','verified','rejected') NOT NULL DEFAULT 'draft',
  submitted_at            DATETIME NULL,
  decided_at              DATETIME NULL,
  decided_by              BIGINT UNSIGNED NULL,
  info_request_message    TEXT NULL,
  rejection_reason        TEXT NULL,
  is_flagged              TINYINT(1) NOT NULL DEFAULT 0,
  flag_reason             VARCHAR(500) NULL,
  blur_faces              TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'privacy: blur children''s faces in photos',
  show_full_names         TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'privacy: show full names of people on the profile',
  terms_accepted_at       DATETIME NULL,
  terms_version           VARCHAR(20) NULL,
  admin_notes             TEXT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orphanages_owner (owner_user_id),
  UNIQUE KEY uq_orphanages_registration (registration_number),
  KEY ix_orphanages_status (verification_status),
  KEY ix_orphanages_region (region_id),
  FULLTEXT KEY ft_orphanages_search (name, city, story),
  CONSTRAINT ck_orphanages_year CHECK (founded_year IS NULL OR founded_year BETWEEN 1800 AND 2100),
  CONSTRAINT ck_orphanages_verified CHECK (verification_status <> 'verified' OR (registration_number IS NOT NULL AND terms_accepted_at IS NOT NULL)),
  CONSTRAINT ck_orphanages_submitted CHECK (verification_status = 'draft' OR submitted_at IS NOT NULL),
  CONSTRAINT fk_orphanages_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orphanages_region FOREIGN KEY (region_id) REFERENCES regions (id),
  CONSTRAINT fk_orphanages_language FOREIGN KEY (story_language) REFERENCES languages (code),
  CONSTRAINT fk_orphanages_profile_photo FOREIGN KEY (profile_photo_upload_id) REFERENCES uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_orphanages_cover_photo FOREIGN KEY (cover_photo_upload_id) REFERENCES uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_orphanages_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='A children''s home. Visible to donors only once verification_status is verified';

CREATE TABLE orphanage_payment_accounts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orphanage_id      BIGINT UNSIGNED NOT NULL,
  payment_method_id TINYINT UNSIGNED NOT NULL,
  provider_name     VARCHAR(80)  NULL COMMENT 'the provider as the orphanage wrote it, when it is not one of the listed methods',
  account_holder    VARCHAR(120) NOT NULL,
  account_number    VARCHAR(60)  NOT NULL,
  confirmed_by      BIGINT UNSIGNED NULL COMMENT 'admin who checked the account belongs to the orphanage',
  confirmed_at      DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_account (orphanage_id, payment_method_id, account_number),
  CONSTRAINT fk_opa_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_opa_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id),
  CONSTRAINT fk_opa_confirmer FOREIGN KEY (confirmed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Where an orphanage wants to receive gifts';

CREATE TABLE orphanage_photos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orphanage_id BIGINT UNSIGNED NOT NULL,
  upload_id    CHAR(32) NOT NULL,
  caption      VARCHAR(255) NULL,
  sort_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orphanage_photos_upload (upload_id),
  KEY ix_orphanage_photos_orphanage (orphanage_id, sort_order),
  CONSTRAINT fk_orphanage_photos_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_orphanage_photos_upload FOREIGN KEY (upload_id) REFERENCES uploads (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Photo gallery of an orphanage';

CREATE TABLE orphanage_posts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orphanage_id    BIGINT UNSIGNED NOT NULL,
  body            TEXT NOT NULL,
  photo_upload_id CHAR(32) NULL,
  hidden_at       DATETIME NULL COMMENT 'set by an admin to hide a post',
  hidden_by       BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_orphanage_posts_orphanage (orphanage_id, created_at),
  CONSTRAINT fk_orphanage_posts_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_orphanage_posts_photo FOREIGN KEY (photo_upload_id) REFERENCES uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_orphanage_posts_hider FOREIGN KEY (hidden_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='News and updates an orphanage shares';

CREATE TABLE visit_requests (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orphanage_id       BIGINT UNSIGNED NOT NULL,
  requester_user_id  BIGINT UNSIGNED NOT NULL,
  preferred_date     DATE NOT NULL,
  visitors_count     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  message            VARCHAR(1000) NULL,
  status             ENUM('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending',
  response_note      VARCHAR(500) NULL,
  responded_at       DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_visit_requests_orphanage (orphanage_id, status),
  KEY ix_visit_requests_requester (requester_user_id),
  CONSTRAINT ck_visit_requests_visitors CHECK (visitors_count BETWEEN 1 AND 20),
  CONSTRAINT fk_visit_requests_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='A supporter asks to visit an orphanage';

-- =====================================================================================
-- 4. PARTNER ORGANIZATIONS
-- =====================================================================================

CREATE TABLE partner_organizations (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id         BIGINT UNSIGNED NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  organization_type_id  TINYINT UNSIGNED NULL,
  country               VARCHAR(100) NULL,
  contact_name          VARCHAR(120) NULL,
  contact_phone         VARCHAR(40)  NULL,
  logo_upload_id        CHAR(32) NULL,
  sponsored_by_blurb    VARCHAR(400) NULL COMMENT 'the short public "sponsored by" message',
  blurb_approved        TINYINT(1) NOT NULL DEFAULT 0,
  sanctions_screened_at DATETIME NULL,
  sanctions_screened_by BIGINT UNSIGNED NULL,
  tier                  ENUM('sponsor','verified_referrer') NOT NULL DEFAULT 'sponsor',
  verification_status   ENUM('draft','pending','needs_info','verified','rejected') NOT NULL DEFAULT 'draft',
  submitted_at          DATETIME NULL,
  decided_at            DATETIME NULL,
  decided_by            BIGINT UNSIGNED NULL,
  info_request_message  TEXT NULL,
  rejection_reason      TEXT NULL,
  is_flagged            TINYINT(1) NOT NULL DEFAULT 0,
  flag_reason           VARCHAR(500) NULL,
  admin_notes           TEXT NULL,
  terms_accepted_at     DATETIME NULL,
  terms_version         VARCHAR(20) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partner_owner (owner_user_id),
  KEY ix_partner_status (verification_status),
  CONSTRAINT ck_partner_verified CHECK (verification_status <> 'verified' OR (sanctions_screened_at IS NOT NULL AND terms_accepted_at IS NOT NULL)),
  CONSTRAINT ck_partner_submitted CHECK (verification_status = 'draft' OR submitted_at IS NOT NULL),
  CONSTRAINT fk_partner_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_partner_type FOREIGN KEY (organization_type_id) REFERENCES organization_types (id),
  CONSTRAINT fk_partner_logo FOREIGN KEY (logo_upload_id) REFERENCES uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_partner_screener FOREIGN KEY (sanctions_screened_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_partner_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='NGOs, companies, diaspora associations and foundations that partner with homes';

CREATE TABLE verification_documents (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  upload_id     CHAR(32) NOT NULL,
  orphanage_id  BIGINT UNSIGNED NULL,
  partner_id    BIGINT UNSIGNED NULL,
  doc_type      ENUM('registration_certificate','tax_clearance','government_id','other') NOT NULL DEFAULT 'other',
  review_status ENUM('submitted','accepted','rejected') NOT NULL DEFAULT 'submitted',
  reviewer_note VARCHAR(500) NULL,
  reviewed_by   BIGINT UNSIGNED NULL,
  reviewed_at   DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_verification_documents_upload (upload_id),
  KEY ix_vd_orphanage (orphanage_id),
  KEY ix_vd_partner (partner_id),
  CONSTRAINT ck_vd_one_owner CHECK ((orphanage_id IS NOT NULL) + (partner_id IS NOT NULL) = 1),
  CONSTRAINT fk_vd_upload FOREIGN KEY (upload_id) REFERENCES uploads (id) ON DELETE CASCADE,
  CONSTRAINT fk_vd_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_vd_partner FOREIGN KEY (partner_id) REFERENCES partner_organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_vd_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Private documents proving who an orphanage or partner is. Each belongs to exactly one of them';

CREATE TABLE partner_sponsorships (
  partner_id   BIGINT UNSIGNED NOT NULL,
  orphanage_id BIGINT UNSIGNED NOT NULL,
  started_on   DATE NOT NULL,
  ended_on     DATE NULL,
  PRIMARY KEY (partner_id, orphanage_id),
  CONSTRAINT ck_sponsorship_dates CHECK (ended_on IS NULL OR ended_on >= started_on),
  CONSTRAINT fk_sponsorship_partner FOREIGN KEY (partner_id) REFERENCES partner_organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_sponsorship_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Which homes a partner sponsors';

CREATE TABLE matching_pledges (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id   BIGINT UNSIGNED NOT NULL,
  description  VARCHAR(400) NOT NULL,
  yearly_limit BIGINT UNSIGNED NOT NULL,
  used_amount  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status       ENUM('proposed','approved','rejected','ended') NOT NULL DEFAULT 'proposed',
  reviewed_by  BIGINT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_matching_pledges_partner (partner_id, status),
  CONSTRAINT ck_matching_limit CHECK (yearly_limit > 0 AND used_amount <= yearly_limit),
  CONSTRAINT fk_matching_partner FOREIGN KEY (partner_id) REFERENCES partner_organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_matching_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='A partner offers to match donor gifts up to a yearly limit';

CREATE TABLE placement_referrals (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id                BIGINT UNSIGNED NOT NULL,
  orphanage_id              BIGINT UNSIGNED NULL,
  social_worker_name        VARCHAR(120) NOT NULL,
  social_worker_phone       VARCHAR(40)  NULL,
  reason_for_referral       TEXT NOT NULL,
  placement_type            VARCHAR(100) NULL,
  educational_status        VARCHAR(150) NULL,
  living_environment_notes  TEXT NULL,
  anticipated_discharge_on  DATE NULL,
  status                    ENUM('pending','accepted','declined','placed','closed') NOT NULL DEFAULT 'pending',
  reviewed_by               BIGINT UNSIGNED NULL,
  reviewed_at               DATETIME NULL,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_placement_partner (partner_id),
  KEY ix_placement_status (status),
  CONSTRAINT fk_placement_partner FOREIGN KEY (partner_id) REFERENCES partner_organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_placement_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE SET NULL,
  CONSTRAINT fk_placement_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='A verified-referrer partner asks a home to take a child. Deliberately holds no child names';

-- =====================================================================================
-- 5. NEEDS, PROGRAMS AND GIVING
-- =====================================================================================

CREATE TABLE programs (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(200) NOT NULL,
  category_id          TINYINT UNSIGNED NULL,
  status               ENUM('planned','active','completed') NOT NULL DEFAULT 'planned',
  description          TEXT NULL,
  funding_goal         BIGINT UNSIGNED NOT NULL DEFAULT 0,
  raised_amount        BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'entered by the admin; programs are not linked to individual gifts yet',
  children_benefiting  INT UNSIGNED NOT NULL DEFAULT 0,
  starts_on            DATE NULL,
  ends_on              DATE NULL,
  created_by           BIGINT UNSIGNED NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_programs_status (status),
  CONSTRAINT ck_programs_dates CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT fk_programs_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_programs_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Fund-raising programs run by the platform (the raised amount comes from donations)';

CREATE TABLE program_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  kind       ENUM('objective','activity') NOT NULL,
  content    VARCHAR(500) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_program_items_program (program_id, kind, sort_order),
  CONSTRAINT fk_program_items_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='The objectives and activities of a program, one per row';

CREATE TABLE needs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orphanage_id  BIGINT UNSIGNED NOT NULL,
  category_id   TINYINT UNSIGNED NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NULL,
  goal_amount   BIGINT UNSIGNED NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'XAF',
  needed_by     DATE NULL,
  pledged_amount BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'money pledged or given so far; only the triggers on donations change it',
  status        ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_at     DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_needs_orphanage (orphanage_id, status),
  FULLTEXT KEY ft_needs_search (title, description),
  CONSTRAINT ck_needs_goal CHECK (goal_amount > 0),
  CONSTRAINT fk_needs_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_needs_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_needs_currency FOREIGN KEY (currency_code) REFERENCES currencies (code)
) ENGINE=InnoDB COMMENT='A specific thing an orphanage needs, with a goal. Progress is calculated, see v_need_progress';

CREATE TABLE donations (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  giver_user_id     BIGINT UNSIGNED NOT NULL COMMENT 'a donor or a partner',
  orphanage_id      BIGINT UNSIGNED NOT NULL,
  need_id           BIGINT UNSIGNED NULL,
  program_id        BIGINT UNSIGNED NULL,
  donation_type     ENUM('money','item') NOT NULL DEFAULT 'money',
  amount            BIGINT UNSIGNED NULL COMMENT 'money gifts, in whole XAF (or the currency below)',
  currency_code     CHAR(3) NOT NULL DEFAULT 'XAF',
  item_description  VARCHAR(500) NULL COMMENT 'item gifts: what was given',
  item_quantity     VARCHAR(60) NULL COMMENT 'as written, for example "12" or "3 boxes"',
  delivery_method   VARCHAR(100) NULL,
  payment_method_id TINYINT UNSIGNED NULL,
  status            ENUM('pledged','completed','failed','refunded','cancelled') NOT NULL DEFAULT 'pledged',
  is_anonymous      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'hide the giver''s name from the orphanage',
  failure_reason    VARCHAR(255) NULL,
  pledged_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_donations_need (need_id, status),
  KEY ix_donations_giver (giver_user_id, created_at),
  KEY ix_donations_orphanage (orphanage_id, status),
  KEY ix_donations_program (program_id),
  CONSTRAINT ck_donations_shape CHECK (
    (donation_type = 'money' AND amount IS NOT NULL AND amount > 0)
    OR (donation_type = 'item' AND item_description IS NOT NULL)
  ),
  CONSTRAINT fk_donations_giver FOREIGN KEY (giver_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_donations_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE RESTRICT,
  CONSTRAINT fk_donations_need FOREIGN KEY (need_id) REFERENCES needs (id) ON DELETE RESTRICT,
  CONSTRAINT fk_donations_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE SET NULL,
  CONSTRAINT fk_donations_currency FOREIGN KEY (currency_code) REFERENCES currencies (code),
  CONSTRAINT fk_donations_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Every pledge and gift (money or items) by donors and partners';

CREATE TABLE recurring_gifts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  giver_user_id  BIGINT UNSIGNED NOT NULL,
  orphanage_id   BIGINT UNSIGNED NOT NULL,
  need_id        BIGINT UNSIGNED NULL,
  amount         BIGINT UNSIGNED NOT NULL,
  currency_code  CHAR(3) NOT NULL DEFAULT 'XAF',
  frequency      ENUM('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
  status         ENUM('active','paused','cancelled') NOT NULL DEFAULT 'active',
  next_gift_on   DATE NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_recurring_giver (giver_user_id, status),
  CONSTRAINT ck_recurring_amount CHECK (amount > 0),
  CONSTRAINT fk_recurring_giver FOREIGN KEY (giver_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_need FOREIGN KEY (need_id) REFERENCES needs (id) ON DELETE SET NULL,
  CONSTRAINT fk_recurring_currency FOREIGN KEY (currency_code) REFERENCES currencies (code)
) ENGINE=InnoDB COMMENT='A gift that repeats (planned feature)';

CREATE TABLE follows (
  user_id      BIGINT UNSIGNED NOT NULL COMMENT 'a donor or a partner',
  orphanage_id BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, orphanage_id),
  KEY ix_follows_orphanage (orphanage_id),
  CONSTRAINT fk_follows_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_orphanage FOREIGN KEY (orphanage_id) REFERENCES orphanages (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Homes a donor follows or a partner has marked as a favourite';

-- =====================================================================================
-- 6. MESSAGES: support threads with the team, and direct chats between members
-- =====================================================================================

CREATE TABLE conversations (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind                       ENUM('support','direct') NOT NULL,
  subject                    VARCHAR(200) NULL,
  support_user_id            BIGINT UNSIGNED NULL COMMENT 'support: the member talking to the team (one thread each)',
  user_low_id                BIGINT UNSIGNED NULL COMMENT 'direct: the two members, smaller id first',
  user_high_id               BIGINT UNSIGNED NULL,
  status                     ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  priority                   ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  last_message_at            DATETIME NULL,
  staff_last_read_message_id BIGINT UNSIGNED NULL COMMENT 'how far the admin team has read',
  created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_support (support_user_id),
  UNIQUE KEY uq_conversations_pair (user_low_id, user_high_id),
  KEY ix_conversations_kind_activity (kind, last_message_at),
  KEY ix_conversations_high (user_high_id),
  CONSTRAINT ck_conversations_shape CHECK (
    (kind = 'support' AND support_user_id IS NOT NULL AND user_low_id IS NULL AND user_high_id IS NULL)
    OR (kind = 'direct' AND support_user_id IS NULL AND user_low_id IS NOT NULL AND user_high_id IS NOT NULL AND user_low_id < user_high_id)
  ),
  CONSTRAINT fk_conversations_support FOREIGN KEY (support_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_low FOREIGN KEY (user_low_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_high FOREIGN KEY (user_high_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='A support thread (member and the team) or a direct chat between two members';

CREATE TABLE messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_user_id  BIGINT UNSIGNED NULL,
  sender_kind     ENUM('member','staff','auto') NOT NULL DEFAULT 'member',
  body            TEXT NOT NULL,
  removed_at      DATETIME NULL COMMENT 'set when the team removes a message',
  removed_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_messages_conversation (conversation_id, id),
  KEY ix_messages_sender (sender_user_id),
  FULLTEXT KEY ft_messages_body (body),
  CONSTRAINT ck_messages_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 2000),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_remover FOREIGN KEY (removed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='One row per message';

CREATE TABLE conversation_reads (
  conversation_id      BIGINT UNSIGNED NOT NULL,
  user_id              BIGINT UNSIGNED NOT NULL,
  last_read_message_id BIGINT UNSIGNED NOT NULL,
  read_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  KEY ix_conversation_reads_user (user_id),
  CONSTRAINT fk_reads_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_reads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='How far each member has read each conversation (drives the unread dots)';

CREATE TABLE notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500) NULL,
  link       VARCHAR(255) NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Alerts shown to a member (and later sent by email)';

-- =====================================================================================
-- 7. SAFETY, REVIEW AND HISTORY
-- =====================================================================================

CREATE TABLE abuse_reports (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_user_id BIGINT UNSIGNED NULL,
  reporter_name    VARCHAR(150) NULL COMMENT 'who made the report, when it was entered by hand or the reporter has no login',
  reporter_account_type VARCHAR(20) NULL,
  reported_user_id BIGINT UNSIGNED NOT NULL,
  reason_category  ENUM('fake_profile','inappropriate_content','harassment','fraud','child_safety','other') NOT NULL,
  details          TEXT NULL,
  status           ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolution       TEXT NULL,
  resolved_by      BIGINT UNSIGNED NULL,
  resolved_at      DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_abuse_status (status, created_at),
  KEY ix_abuse_reported (reported_user_id),
  CONSTRAINT fk_abuse_reporter FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_abuse_reported FOREIGN KEY (reported_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_abuse_resolver FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Reports about accounts, profiles or messages that need the team''s attention';

CREATE TABLE appeals (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type ENUM('orphanage','partner') NOT NULL,
  subject_id   BIGINT UNSIGNED NOT NULL,
  message      TEXT NOT NULL,
  status       ENUM('open','upheld','dismissed') NOT NULL DEFAULT 'open',
  decided_by   BIGINT UNSIGNED NULL,
  decided_at   DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_appeals_subject (subject_type, subject_id),
  CONSTRAINT fk_appeals_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='When a rejected orphanage or partner asks for a second look';

CREATE TABLE audit_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action        VARCHAR(255) NOT NULL COMMENT 'for example approved, rejected, info_requested, flagged, login_failed',
  entity_type   VARCHAR(40) NOT NULL COMMENT 'orphanage, partner, donor, need, donation ...',
  entity_id     BIGINT UNSIGNED NULL,
  details       JSON NULL,
  ip_address    VARCHAR(45) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id, created_at),
  KEY ix_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Who did what and when. Replaces the per-record activity logs, and is never edited';

CREATE TABLE password_reset_tokens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   CHAR(64) NOT NULL COMMENT 'SHA-256 of the emailed token; the token itself is never stored',
  expires_at   DATETIME NOT NULL,
  used_at      DATETIME NULL,
  requested_ip VARCHAR(45) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  KEY ix_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='For the email password reset that is not built yet';

CREATE TABLE organization_settings (
  id               TINYINT UNSIGNED NOT NULL DEFAULT 1,
  org_name         VARCHAR(150) NOT NULL DEFAULT 'CAM Orphanage Connect',
  org_email        VARCHAR(190) NULL,
  org_phone        VARCHAR(40)  NULL,
  org_address      VARCHAR(255) NULL,
  org_description  TEXT NULL,
  default_currency CHAR(3) NOT NULL DEFAULT 'XAF',
  notify_email     TINYINT(1) NOT NULL DEFAULT 1,
  notify_donations TINYINT(1) NOT NULL DEFAULT 1,
  notify_messages  TINYINT(1) NOT NULL DEFAULT 1,
  updated_by       BIGINT UNSIGNED NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_settings_single_row CHECK (id = 1),
  CONSTRAINT fk_settings_currency FOREIGN KEY (default_currency) REFERENCES currencies (code),
  CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='One row: the organization details shown on the public Contact page';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================================
-- 8. REFERENCE DATA
-- =====================================================================================

INSERT INTO regions (name, code) VALUES
  ('Adamawa', 'AD'), ('Centre', 'CE'), ('East', 'ES'), ('Far North', 'EN'), ('Littoral', 'LT'),
  ('North', 'NO'), ('North-West', 'NW'), ('West', 'OU'), ('South', 'SU'), ('South-West', 'SW');

INSERT INTO languages (code, name) VALUES ('en', 'English'), ('fr', 'French');

INSERT INTO currencies (code, name, symbol) VALUES
  ('XAF', 'Central African CFA franc', 'FCFA'), ('EUR', 'Euro', 'EUR'), ('USD', 'US dollar', 'USD');

INSERT INTO payment_methods (name, kind) VALUES
  ('MTN Mobile Money', 'mobile_money'), ('Orange Money', 'mobile_money'),
  ('Card', 'card'), ('Bank transfer', 'bank_transfer'), ('Other', 'other');

INSERT INTO organization_types (name) VALUES
  ('NGO'), ('Corporate'), ('Diaspora Association'), ('Foundation'), ('Faith group'), ('Other');

INSERT INTO categories (name) VALUES
  ('Education'), ('Health'), ('Food and nutrition'), ('Housing and bedding'),
  ('Clothing'), ('Equipment'), ('Other');

INSERT INTO admin_roles (name, description, can_manage_users, can_see_finance, can_verify, can_moderate) VALUES
  ('Super Admin',     'Full access to everything',                          1, 1, 1, 1),
  ('Administrator',   'Runs the platform day to day, including finance',   0, 1, 1, 1),
  ('Content Manager', 'Reviews profiles and messages, no finance access',  0, 0, 1, 1);

INSERT INTO organization_settings (id) VALUES (1);

-- =====================================================================================
-- 9. RULES THE DATABASE ENFORCES BY ITSELF (triggers)
--    These protect the data even if some code forgets a check.
-- =====================================================================================

DELIMITER $$

-- Emails are always stored trimmed and in lower case.
CREATE TRIGGER trg_users_email_insert BEFORE INSERT ON users FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
END$$

CREATE TRIGGER trg_users_email_update BEFORE UPDATE ON users FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
END$$

-- Each profile table may only point at a login of the matching kind.
CREATE TRIGGER trg_admin_profiles_role BEFORE INSERT ON admin_profiles FOR EACH ROW
BEGIN
  IF IFNULL((SELECT role FROM users WHERE id = NEW.user_id), '') <> 'admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An admin profile needs a user with role admin';
  END IF;
END$$

CREATE TRIGGER trg_donor_profiles_role BEFORE INSERT ON donor_profiles FOR EACH ROW
BEGIN
  IF IFNULL((SELECT role FROM users WHERE id = NEW.user_id), '') <> 'donor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A donor profile needs a user with role donor';
  END IF;
END$$

CREATE TRIGGER trg_orphanages_owner_role BEFORE INSERT ON orphanages FOR EACH ROW
BEGIN
  IF IFNULL((SELECT role FROM users WHERE id = NEW.owner_user_id), '') <> 'orphanage' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The owner of an orphanage must be a user with role orphanage';
  END IF;
END$$

CREATE TRIGGER trg_partner_owner_role BEFORE INSERT ON partner_organizations FOR EACH ROW
BEGIN
  IF IFNULL((SELECT role FROM users WHERE id = NEW.owner_user_id), '') <> 'partner' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The owner of a partner organization must be a user with role partner';
  END IF;
END$$

-- Giving: only approved donors and verified partners can give, only to verified orphanages,
-- the need must belong to that orphanage, and a gift can never be larger than what is still needed.
CREATE TRIGGER trg_donations_rules BEFORE INSERT ON donations FOR EACH ROW
BEGIN
  DECLARE giver_role      VARCHAR(20);
  DECLARE home_state      VARCHAR(20);
  DECLARE need_home       BIGINT UNSIGNED;
  DECLARE need_state      VARCHAR(10);
  DECLARE need_goal       BIGINT UNSIGNED;
  DECLARE already_pledged BIGINT UNSIGNED;

  SELECT role INTO giver_role FROM users WHERE id = NEW.giver_user_id;
  IF giver_role IS NULL OR giver_role NOT IN ('donor', 'partner') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only donors and partners can give';
  END IF;

  IF giver_role = 'donor' AND IFNULL((SELECT approval_status FROM donor_profiles WHERE user_id = NEW.giver_user_id), 'none') <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only approved donors can give';
  END IF;
  IF giver_role = 'partner' AND IFNULL((SELECT verification_status FROM partner_organizations WHERE owner_user_id = NEW.giver_user_id), 'none') <> 'verified' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only verified partners can give';
  END IF;

  SELECT verification_status INTO home_state FROM orphanages WHERE id = NEW.orphanage_id;
  IF home_state IS NULL OR home_state <> 'verified' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gifts can only go to verified orphanages';
  END IF;

  IF NEW.need_id IS NOT NULL THEN
    -- FOR UPDATE makes two people pledging to the same need at the same moment wait for each other,
    -- and it reads the latest running total, so the need can never be over-filled
    SELECT orphanage_id, status, goal_amount, pledged_amount INTO need_home, need_state, need_goal, already_pledged
      FROM needs WHERE id = NEW.need_id FOR UPDATE;
    IF need_home IS NULL OR need_home <> NEW.orphanage_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That need does not belong to this orphanage';
    END IF;
    IF NEW.status IN ('pledged', 'completed') AND need_state <> 'open' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This need is closed';
    END IF;
    IF NEW.donation_type = 'money' AND NEW.status IN ('pledged', 'completed') THEN
      IF already_pledged + NEW.amount > need_goal THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That gift is larger than what this need still requires';
      END IF;
    END IF;
  END IF;
END$$

-- Messaging: a direct chat is between an orphanage and a donor or partner; a support thread is
-- between one member and the team; staff messages come from admins only.
CREATE TRIGGER trg_donations_total_insert AFTER INSERT ON donations FOR EACH ROW
BEGIN
  IF NEW.need_id IS NOT NULL AND NEW.donation_type = 'money' AND NEW.status IN ('pledged', 'completed') THEN
    UPDATE needs SET pledged_amount = pledged_amount + NEW.amount WHERE id = NEW.need_id;
  END IF;
END$$

CREATE TRIGGER trg_donations_total_update AFTER UPDATE ON donations FOR EACH ROW
BEGIN
  IF OLD.need_id IS NOT NULL AND OLD.donation_type = 'money' AND OLD.status IN ('pledged', 'completed') THEN
    UPDATE needs SET pledged_amount = pledged_amount - OLD.amount WHERE id = OLD.need_id;
  END IF;
  IF NEW.need_id IS NOT NULL AND NEW.donation_type = 'money' AND NEW.status IN ('pledged', 'completed') THEN
    UPDATE needs SET pledged_amount = pledged_amount + NEW.amount WHERE id = NEW.need_id;
  END IF;
END$$

CREATE TRIGGER trg_donations_total_delete AFTER DELETE ON donations FOR EACH ROW
BEGIN
  IF OLD.need_id IS NOT NULL AND OLD.donation_type = 'money' AND OLD.status IN ('pledged', 'completed') THEN
    UPDATE needs SET pledged_amount = pledged_amount - OLD.amount WHERE id = OLD.need_id;
  END IF;
END$$

CREATE TRIGGER trg_conversations_members BEFORE INSERT ON conversations FOR EACH ROW
BEGIN
  DECLARE role_low  VARCHAR(20);
  DECLARE role_high VARCHAR(20);

  IF NEW.kind = 'direct' THEN
    SELECT role INTO role_low  FROM users WHERE id = NEW.user_low_id;
    SELECT role INTO role_high FROM users WHERE id = NEW.user_high_id;
    IF NOT ((role_low = 'orphanage' AND role_high IN ('donor', 'partner'))
         OR (role_high = 'orphanage' AND role_low IN ('donor', 'partner'))) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Direct chats are between an orphanage and a donor or a partner';
    END IF;
  ELSEIF IFNULL((SELECT role FROM users WHERE id = NEW.support_user_id), 'admin') = 'admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A support thread belongs to a member, not to an admin';
  END IF;
END$$

CREATE TRIGGER trg_messages_sender BEFORE INSERT ON messages FOR EACH ROW
BEGIN
  DECLARE c_support BIGINT UNSIGNED;
  DECLARE c_low     BIGINT UNSIGNED;
  DECLARE c_high    BIGINT UNSIGNED;

  IF NEW.sender_kind = 'staff' THEN
    IF IFNULL((SELECT role FROM users WHERE id = NEW.sender_user_id), '') <> 'admin' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staff messages must come from an admin';
    END IF;
  ELSEIF NEW.sender_kind = 'member' THEN
    SELECT support_user_id, user_low_id, user_high_id INTO c_support, c_low, c_high
      FROM conversations WHERE id = NEW.conversation_id;
    IF NOT (NEW.sender_user_id <=> c_support OR NEW.sender_user_id <=> c_low OR NEW.sender_user_id <=> c_high) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the people in a conversation can write in it';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_messages_touch AFTER INSERT ON messages FOR EACH ROW
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
END$$

DELIMITER ;

-- =====================================================================================
-- 10. VIEWS: ready-made answers the website reads from
-- =====================================================================================

-- Progress of every need: how much is pledged, by how many people, and how full it is.
CREATE VIEW v_need_progress AS
SELECT t.*,
       LEAST(100, FLOOR(100 * t.pledged_amount / t.goal_amount)) AS percent_funded,
       (t.pledged_amount >= t.goal_amount) AS is_funded
FROM (
  SELECT n.id AS need_id, n.orphanage_id, n.title, n.goal_amount, n.currency_code, n.status AS need_status, n.pledged_amount,
         COUNT(DISTINCT CASE WHEN d.status IN ('pledged', 'completed') THEN d.giver_user_id END) AS supporters
  FROM needs n
  LEFT JOIN donations d ON d.need_id = n.id
  GROUP BY n.id, n.orphanage_id, n.title, n.goal_amount, n.currency_code, n.status, n.pledged_amount
) AS t;

-- What approved donors and verified partners see when they browse.
CREATE VIEW v_public_orphanages AS
SELECT o.id AS orphanage_id, o.name, r.name AS region, o.city, o.story, o.story_language,
       o.children_count, o.founded_year, o.profile_photo_upload_id, o.cover_photo_upload_id,
       (SELECT COUNT(*) FROM v_need_progress p
         WHERE p.orphanage_id = o.id AND p.need_status = 'open' AND NOT p.is_funded) AS open_needs,
       COALESCE((SELECT SUM(d.amount) FROM donations d
                 WHERE d.orphanage_id = o.id AND d.donation_type = 'money' AND d.status IN ('pledged', 'completed')), 0) AS total_pledged,
       (SELECT COUNT(*) FROM follows f WHERE f.orphanage_id = o.id) AS followers
FROM orphanages o
LEFT JOIN regions r ON r.id = o.region_id
WHERE o.verification_status = 'verified' AND o.is_flagged = 0;

-- One line per donor for the admin Donors page.
CREATE VIEW v_donor_summary AS
SELECT u.id AS user_id, u.display_name, u.email, p.location_text, p.approval_status, p.is_vip,
       u.created_at AS joined_at, p.last_active_at,
       COALESCE(SUM(CASE WHEN d.donation_type = 'money' AND d.status IN ('pledged', 'completed') THEN d.amount END), 0) AS total_given,
       COUNT(d.id) AS gifts_count,
       COUNT(DISTINCT d.orphanage_id) AS homes_supported,
       MAX(d.created_at) AS last_gift_at
FROM users u
JOIN donor_profiles p ON p.user_id = u.id
LEFT JOIN donations d ON d.giver_user_id = u.id
GROUP BY u.id, u.display_name, u.email, p.location_text, p.approval_status, p.is_vip, u.created_at, p.last_active_at;

-- One line per partner for the admin Partners page.
CREATE VIEW v_partner_summary AS
SELECT po.id AS partner_id, po.name, u.email, t.name AS organization_type, po.country, po.tier,
       po.verification_status, po.submitted_at,
       (SELECT COUNT(*) FROM verification_documents vd WHERE vd.partner_id = po.id) AS documents,
       COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.giver_user_id = po.owner_user_id
                 AND d.donation_type = 'money' AND d.status IN ('pledged', 'completed')), 0) AS total_contributed,
       (SELECT COUNT(*) FROM follows f WHERE f.user_id = po.owner_user_id) AS favourite_homes
FROM partner_organizations po
JOIN users u ON u.id = po.owner_user_id
LEFT JOIN organization_types t ON t.id = po.organization_type_id;

-- Everything waiting for an admin decision, oldest first.
CREATE VIEW v_review_queue AS
SELECT 'orphanage' AS subject_type, o.id AS subject_id, o.name, o.verification_status, o.submitted_at,
       (SELECT COUNT(*) FROM verification_documents vd WHERE vd.orphanage_id = o.id) AS documents
FROM orphanages o WHERE o.verification_status IN ('pending', 'needs_info')
UNION ALL
SELECT 'partner', po.id, po.name, po.verification_status, po.submitted_at,
       (SELECT COUNT(*) FROM verification_documents vd WHERE vd.partner_id = po.id)
FROM partner_organizations po WHERE po.verification_status IN ('pending', 'needs_info')
UNION ALL
SELECT 'donor', dp.user_id, u.display_name, dp.approval_status, dp.created_at, 0
FROM donor_profiles dp JOIN users u ON u.id = dp.user_id WHERE dp.approval_status = 'pending';

-- The admin Support Center: one line per member thread, with an unread flag for the team.
CREATE VIEW v_support_inbox AS
SELECT c.id AS conversation_id, u.id AS user_id, u.display_name, u.role, c.status, c.priority, c.last_message_at,
       (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
       EXISTS (SELECT 1 FROM messages m
               WHERE m.conversation_id = c.id AND m.sender_kind = 'member'
                 AND m.id > IFNULL(c.staff_last_read_message_id, 0)) AS has_unread_for_staff
FROM conversations c
JOIN users u ON u.id = c.support_user_id
WHERE c.kind = 'support';

-- The five numbers on the website's home page (same as GET /api/site/stats).
CREATE VIEW v_site_stats AS
SELECT
  (SELECT COUNT(*) FROM orphanages WHERE verification_status = 'verified') AS verified_orphanages,
  (SELECT COUNT(*) FROM v_need_progress p JOIN orphanages o ON o.id = p.orphanage_id
     WHERE o.verification_status = 'verified' AND p.need_status = 'open' AND NOT p.is_funded) AS open_needs,
  (SELECT COALESCE(SUM(amount), 0) FROM donations
     WHERE donation_type = 'money' AND status IN ('pledged', 'completed')) AS total_pledged,
  (SELECT COUNT(*) FROM donor_profiles WHERE approval_status = 'active') AS approved_donors,
  (SELECT COUNT(*) FROM partner_organizations WHERE verification_status = 'verified') AS verified_partners;

-- =====================================================================================
-- Done. This line shows in Workbench's result grid when the whole script has run.
-- =====================================================================================
SELECT 'cam_orphanage_connect is ready' AS message,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cam_orphanage_connect' AND table_type = 'BASE TABLE') AS tables,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cam_orphanage_connect' AND table_type = 'VIEW') AS views,
       (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'cam_orphanage_connect') AS triggers;
