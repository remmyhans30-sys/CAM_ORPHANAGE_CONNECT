require('dotenv').config();
const db = require('./db');
const orphanages = require('./repo/orphanages');
const { ensureFirstAdmin, LOCAL_DEFAULT } = require('./firstAdmin');

// Sample orphanages are for local testing only; set SEED_SAMPLE_DATA=false on the live site.
const SAMPLES = [
  {
    name: "Hope Children's Home",
    location: 'Buea, Southwest Region',
    registrationNumber: 'MINAS/2022/00123',
    story: 'A home for children in Buea providing shelter, education, and care since 2012.',
    storyLanguage: 'en',
    status: 'verified',
    childrenCount: 32,
    foundedYear: 2012,
    capacity: 40,
    contactName: 'Grace Ebong',
    contactPhone: '+237 677 123 456',
    contactEmail: 'contact@hopechildrenshome.org',
  },
  {
    name: "Foyer de l'Esperance",
    location: 'Yaounde, Centre Region',
    registrationNumber: 'MINAS/2023/00456',
    story: 'Un foyer pour enfants a Yaounde offrant un abri sur et un accompagnement scolaire.',
    storyLanguage: 'fr',
    status: 'pending',
    childrenCount: 18,
    foundedYear: 2019,
    capacity: 25,
    contactName: 'Jean-Paul Mbarga',
    contactPhone: '+237 699 234 567',
    contactEmail: 'contact@foyerdelesperance.org',
    submittedDate: '2026-08-10',
  },
  {
    name: 'Grace Orphanage',
    location: 'Bamenda, Northwest Region',
    registrationNumber: 'MINAS/2021/00789',
    story: 'Serving vulnerable children in Bamenda with housing, meals, and schooling support.',
    storyLanguage: 'en',
    status: 'verified',
    childrenCount: 27,
    foundedYear: 2015,
    capacity: 35,
    contactName: 'Comfort Ngwa',
    contactPhone: '+237 675 345 678',
    contactEmail: 'contact@graceorphanage.org',
  },
];

async function main() {
  if (await db.ensureDatabase()) console.log('Created the ' + db.DB_NAME + ' database in MySQL.');

  const admin = await ensureFirstAdmin({ allowDefault: true });
  if (!admin.created) {
    console.log('Admins already exist — skipping admin seed.');
  } else if (admin.usedDefault) {
    console.log(`Created default admin: ${LOCAL_DEFAULT.email} / ${LOCAL_DEFAULT.password} — change this password after first login.`);
  } else {
    console.log(`Created admin ${admin.email} from ADMIN_EMAIL / ADMIN_PASSWORD.`);
  }

  const count = (await db.one('SELECT COUNT(*) AS n FROM orphanages')).n;
  if (process.env.SEED_SAMPLE_DATA === 'false') {
    console.log('SEED_SAMPLE_DATA=false — skipping sample orphanages.');
  } else if (count === 0) {
    for (const sample of SAMPLES) {
      const id = await orphanages.createByAdmin(sample);
      await orphanages.save(id, { ...sample, termsAgreed: true }, { isAdmin: false });
    }
    console.log(`Seeded ${SAMPLES.length} sample orphanages.`);
  } else {
    console.log('Orphanages already exist — skipping orphanage seed.');
  }
}

main()
  .catch((err) => {
    console.error('Seeding failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
