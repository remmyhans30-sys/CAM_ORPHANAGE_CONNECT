require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEFAULT_ADMIN = {
  name: 'Default Super Admin',
  email: 'admin@camorphanage.org',
  password: 'ChangeMe123!',
  role: 'Super Admin',
};

const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
if (adminCount === 0) {
  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10);
  db.prepare('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, passwordHash, DEFAULT_ADMIN.role);
  console.log(`Created default admin: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password} — change this password after first login.`);
} else {
  console.log('Admins already exist — skipping admin seed.');
}

const orphanageCount = db.prepare('SELECT COUNT(*) AS count FROM orphanages').get().count;
if (orphanageCount === 0) {
  const insert = db.prepare(`
    INSERT INTO orphanages (
      name, location, registration_number, story, story_language, status,
      children_count, followers_count, founded_year, capacity,
      contact_name, contact_phone, contact_email, terms_agreed,
      photo_url, cover_photo_url, documents, submitted_date
    ) VALUES (
      @name, @location, @registration_number, @story, @story_language, @status,
      @children_count, @followers_count, @founded_year, @capacity,
      @contact_name, @contact_phone, @contact_email, @terms_agreed,
      @photo_url, @cover_photo_url, @documents, @submitted_date
    )
  `);

  const samples = [
    {
      name: "Hope Children's Home",
      location: 'Buea, Southwest Region',
      registration_number: 'MINAS/2022/00123',
      story: 'A home for children in Buea providing shelter, education, and care since 2012.',
      story_language: 'en',
      status: 'verified',
      children_count: 32,
      followers_count: 128,
      founded_year: 2012,
      capacity: 40,
      contact_name: 'Grace Ebong',
      contact_phone: '+237 677 123 456',
      contact_email: 'contact@hopechildrenshome.org',
      terms_agreed: 1,
      photo_url: 'https://picsum.photos/seed/hope-avatar/200/200',
      cover_photo_url: 'https://picsum.photos/seed/hope-cover/600/200',
      documents: JSON.stringify(['registration-certificate.pdf', 'director-id.pdf']),
      submitted_date: null,
    },
    {
      name: "Foyer de l'Esperance",
      location: 'Yaounde, Centre Region',
      registration_number: 'MINAS/2023/00456',
      story: 'Un foyer pour enfants a Yaounde offrant un abri sur et un accompagnement scolaire.',
      story_language: 'fr',
      status: 'pending',
      children_count: 18,
      followers_count: 9,
      founded_year: 2019,
      capacity: 25,
      contact_name: 'Jean-Paul Mbarga',
      contact_phone: '+237 699 234 567',
      contact_email: 'contact@foyerdelesperance.org',
      terms_agreed: 0,
      photo_url: null,
      cover_photo_url: null,
      documents: JSON.stringify([]),
      submitted_date: '2026-08-10',
    },
    {
      name: 'Grace Orphanage',
      location: 'Bamenda, Northwest Region',
      registration_number: 'MINAS/2021/00789',
      story: 'Serving vulnerable children in Bamenda with housing, meals, and schooling support.',
      story_language: 'en',
      status: 'verified',
      children_count: 27,
      followers_count: 76,
      founded_year: 2015,
      capacity: 35,
      contact_name: 'Comfort Ngwa',
      contact_phone: '+237 675 345 678',
      contact_email: 'contact@graceorphanage.org',
      terms_agreed: 1,
      photo_url: 'https://picsum.photos/seed/grace-avatar/200/200',
      cover_photo_url: null,
      documents: JSON.stringify(['registration-certificate.pdf']),
      submitted_date: null,
    },
  ];

  samples.forEach((sample) => insert.run(sample));
  console.log(`Seeded ${samples.length} sample orphanages.`);
} else {
  console.log('Orphanages already exist — skipping orphanage seed.');
}
