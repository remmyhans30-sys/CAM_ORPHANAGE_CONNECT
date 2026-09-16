/*
 * Shared data contract for CAM Orphanage Connect.
 *
 * A "need" object MUST always have exactly this shape — field names and
 * types are shared across teammates' pages, so don't rename or extend it:
 *
 *   need = {
 *     title:   string,  // short label, e.g. "New mattresses"
 *     raised:  number,  // amount raised so far (XAF)
 *     goal:    number,  // funding target (XAF)
 *     percent: number   // 0-100, progress toward goal
 *   }
 *
 * This file is mock/sample data standing in for a future API. Replace
 * ORPHANAGES with a real fetch() call when the backend is ready — the
 * shape of the data should stay the same so pages built against it don't
 * need to change.
 */

const ORPHANAGES = [
  {
    id: 'hope-house-yaounde',
    name: 'Hope House',
    location: 'Yaoundé, Centre',
    verified: true,
    image: '../login/images/photo1.jpg',
    needs: [
      { title: 'New mattresses for dormitory', raised: 185000, goal: 250000, percent: 74 },
      { title: 'School fees — 12 children', raised: 420000, goal: 600000, percent: 70 },
      { title: 'Kitchen water filter', raised: 40000, goal: 120000, percent: 33 }
    ]
  },
  {
    id: 'sunrise-orphanage-douala',
    name: 'Sunrise Orphanage',
    location: 'Douala, Littoral',
    verified: true,
    image: '../login/images/photo2.jpg',
    needs: [
      { title: 'Roof repair before rainy season', raised: 310000, goal: 500000, percent: 62 },
      { title: 'Books & school supplies', raised: 95000, goal: 100000, percent: 95 }
    ]
  },
  {
    id: 'little-angels-bamenda',
    name: 'Little Angels Home',
    location: 'Bamenda, North West',
    verified: true,
    image: '../login/images/photo3.jpg',
    needs: [
      { title: 'Emergency medical fund', raised: 60000, goal: 300000, percent: 20 },
      { title: 'Solar lighting installation', raised: 150000, goal: 150000, percent: 100 },
      { title: 'Bunk beds — new intake', raised: 22000, goal: 200000, percent: 11 }
    ]
  },
  {
    id: 'grace-haven-bafoussam',
    name: 'Grace Haven',
    location: 'Bafoussam, West',
    verified: false,
    image: '../login/images/photo4.jpg',
    needs: [
      { title: 'Well water access', raised: 80000, goal: 400000, percent: 20 },
      { title: 'Winter clothing drive', raised: 30000, goal: 90000, percent: 33 }
    ]
  },
  {
    id: 'shalom-children-buea',
    name: 'Shalom Children\'s Center',
    location: 'Buea, South West',
    verified: true,
    image: '../login/images/photo5.jpg',
    needs: [
      { title: 'Nutrition program — 3 months', raised: 275000, goal: 275000, percent: 100 },
      { title: 'Classroom furniture', raised: 54000, goal: 180000, percent: 30 }
    ]
  }
];

/** Returns the full list of orphanages (deep-ish copy is not needed for mock data). */
function getOrphanages() {
  return ORPHANAGES;
}

/** Returns every need across all orphanages, each tagged with its parent orphanage's info. */
function getAllNeeds() {
  return ORPHANAGES.flatMap(function (orphanage) {
    return orphanage.needs.map(function (need) {
      return {
        orphanageId: orphanage.id,
        orphanageName: orphanage.name,
        orphanageLocation: orphanage.location,
        verified: orphanage.verified,
        need: need
      };
    });
  });
}

/** Looks up a single orphanage by id, or null if not found. */
function getOrphanageById(id) {
  return ORPHANAGES.find(function (o) { return o.id === id; }) || null;
}

/*
 * Child profiles, seeded per orphanage (referenced by orphanageId). This is
 * a separate concern from the `need` contract above — nothing here changes
 * that shape. The admin "Manage Children" page owns editing this list (via
 * its own localStorage-backed copy); other pages should treat CHILDREN as
 * read-only sample data.
 */
const CHILDREN = [
  { id: 'child-001', name: 'Amina Nsang', age: 8, gender: 'Female', orphanageId: 'hope-house-yaounde', status: 'Sponsored', photo: '../login/images/photo1.jpg', notes: 'Enjoys reading and art. In Grade 3.' },
  { id: 'child-002', name: 'Emmanuel Fru', age: 11, gender: 'Male', orphanageId: 'hope-house-yaounde', status: 'Needs Sponsor', photo: '../login/images/photo2.jpg', notes: 'Loves football and math.' },
  { id: 'child-003', name: 'Divine Mbeki', age: 6, gender: 'Male', orphanageId: 'sunrise-orphanage-douala', status: 'Needs Sponsor', photo: '../login/images/photo3.jpg', notes: '' },
  { id: 'child-004', name: 'Precious Ayuk', age: 9, gender: 'Female', orphanageId: 'sunrise-orphanage-douala', status: 'Sponsored', photo: '../login/images/photo4.jpg', notes: 'Sings in the school choir.' },
  { id: 'child-005', name: 'Blessing Njoya', age: 13, gender: 'Female', orphanageId: 'little-angels-bamenda', status: 'Sponsored', photo: '../login/images/photo5.jpg', notes: '' },
  { id: 'child-006', name: 'Ndifon Tabi', age: 7, gender: 'Male', orphanageId: 'little-angels-bamenda', status: 'Needs Sponsor', photo: '../login/images/photo6.jpg', notes: 'New arrival this term.' },
  { id: 'child-007', name: 'Grace Etonde', age: 10, gender: 'Female', orphanageId: 'grace-haven-bafoussam', status: 'Needs Sponsor', photo: '../login/images/photo7.jpg', notes: '' },
  { id: 'child-008', name: 'Samuel Kongnso', age: 5, gender: 'Male', orphanageId: 'shalom-children-buea', status: 'Sponsored', photo: '../login/images/photo8.jpg', notes: 'Youngest at the center.' }
];

/** Returns the seed list of children (deep-ish copy not needed for mock data). */
function getChildren() {
  return CHILDREN;
}

/** Looks up a single seed child by id, or null if not found. */
function getChildById(id) {
  return CHILDREN.find(function (c) { return c.id === id; }) || null;
}

/*
 * Incoming donations log — a record of individual gifts, distinct from a
 * need's running `raised` total above. Admin's "Incoming Donations" view
 * lists these; it does not edit them (donations are historical facts).
 */
const DONATIONS = [
  { id: 'don-001', donorName: 'Marie Fotso', orphanageId: 'hope-house-yaounde', needTitle: 'New mattresses for dormitory', amount: 25000, date: '2026-08-28', status: 'Completed' },
  { id: 'don-002', donorName: 'Paul Eyenga', orphanageId: 'sunrise-orphanage-douala', needTitle: 'Books & school supplies', amount: 15000, date: '2026-08-26', status: 'Completed' },
  { id: 'don-003', donorName: 'Anonymous', orphanageId: 'little-angels-bamenda', needTitle: 'Solar lighting installation', amount: 50000, date: '2026-08-22', status: 'Completed' },
  { id: 'don-004', donorName: 'Chantal Mballa', orphanageId: 'hope-house-yaounde', needTitle: 'School fees — 12 children', amount: 100000, date: '2026-08-19', status: 'Completed' },
  { id: 'don-005', donorName: 'Junior Abanda', orphanageId: 'shalom-children-buea', needTitle: 'Classroom furniture', amount: 10000, date: '2026-08-15', status: 'Pending' },
  { id: 'don-006', donorName: 'Grace Ngu', orphanageId: 'grace-haven-bafoussam', needTitle: 'Well water access', amount: 20000, date: '2026-08-10', status: 'Completed' }
];

/** Returns the incoming-donations log (read-only sample data). */
function getDonations() {
  return DONATIONS;
}

/*
 * Visit requests — a donor/sponsor asking to visit an orphanage in person.
 * Admin can approve/decline these, so `status` is meant to be updated by
 * the admin page (which keeps its own localStorage-backed working copy).
 */
const VISIT_REQUESTS = [
  { id: 'visit-001', requesterName: 'Marie Fotso', email: 'marie.fotso@example.com', orphanageId: 'hope-house-yaounde', requestedDate: '2026-09-20', message: 'Would love to bring school supplies in person.', status: 'Pending' },
  { id: 'visit-002', requesterName: 'Paul Eyenga', email: 'paul.eyenga@example.com', orphanageId: 'sunrise-orphanage-douala', requestedDate: '2026-09-25', message: '', status: 'Approved' },
  { id: 'visit-003', requesterName: 'Junior Abanda', email: 'junior.a@example.com', orphanageId: 'shalom-children-buea', requestedDate: '2026-09-18', message: 'Visiting with two colleagues.', status: 'Pending' },
  { id: 'visit-004', requesterName: 'Grace Ngu', email: 'grace.ngu@example.com', orphanageId: 'grace-haven-bafoussam', requestedDate: '2026-09-12', message: '', status: 'Declined' }
];

/** Returns the seed list of visit requests. */
function getVisitRequests() {
  return VISIT_REQUESTS;
}
