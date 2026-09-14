/*
 * Shared data contract for donor-facing pages.
 * need = { title, raised, goal, percent }
 * orphanage = { id, name, location, story, photo, verificationStatus, needs }
 */

const orphanages = [
  {
    id: 'hope-house-yaounde',
    name: 'Hope House',
    location: 'Yaoundé',
    story: 'Hope House has cared for children in Yaoundé since 2010, focusing on education and family reunification.',
    photo: 'images/hope-house.jpg',
    verificationStatus: 'verified',
    needs: [
      { title: 'School fees for 12 children', raised: 150000, goal: 300000, percent: 50 }
    ]
  },
  {
    id: 'sunrise-home-douala',
    name: 'Sunrise Home',
    location: 'Douala',
    story: 'Sunrise Home is a new shelter in Douala awaiting verification, serving 8 children aged 4-12.',
    photo: 'images/sunrise-home.jpg',
    verificationStatus: 'pending',
    needs: [
      { title: 'Mattresses and bedding', raised: 20000, goal: 80000, percent: 25 }
    ]
  },
  {
    id: 'grace-center-bamenda',
    name: 'Grace Center',
    location: 'Bamenda',
    story: 'Grace Center has supported orphaned and vulnerable children in Bamenda for over 15 years.',
    photo: 'images/grace-center.jpg',
    verificationStatus: 'verified',
    needs: [
      { title: 'Kitchen renovation', raised: 100000, goal: 100000, percent: 100 },
      { title: 'Medical checkups for 20 children', raised: 45000, goal: 200000, percent: 23 }
    ]
  }
];

function getOrphanages() {
  return orphanages;
}

function getOrphanageById(id) {
  return orphanages.find(function (o) {
    return o.id === id;
  });
}
