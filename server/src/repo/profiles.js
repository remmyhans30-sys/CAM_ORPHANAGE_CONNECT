const orphanages = require('./orphanages');
const needs = require('./needs');
const posts = require('./posts');
const donations = require('./donations');

// What approved donors and verified partners see of one listed orphanage before deciding to give
// (donor/orphanage.html and partner/orphanage-view.html). The home's phone, email, payment account
// and documents are never included: supporters reach a home through messages and visit requests on
// the site, where the team can keep everyone safe.

// Only listed homes (verified, not flagged). An id that is not a positive whole number simply finds nothing.
async function listedHome(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? orphanages.getListed(id) : null;
}

function toNeed(n) {
  return { id: n.id, title: n.title, description: n.description, goal: n.goal, raised: n.raised, percent: n.percent, date: n.date };
}

async function forSupporters(orphanageId) {
  const home = await listedHome(orphanageId);
  if (!home) return null;

  const all = await needs.forOrphanage(home.id);
  const counts = await posts.countFor([home.id]);
  return {
    orphanage: {
      id: home.id,
      name: home.name,
      location: home.location,
      story: home.story,
      storyLanguage: home.storyLanguage,
      childrenCount: home.childrenCount,
      capacity: home.capacity,
      foundedYear: home.foundedYear,
      contactName: home.contactName,
      registrationNumber: home.registrationNumber,
      photoUrl: home.photoUrl,
      coverPhotoUrl: home.coverPhotoUrl,
      gallery: home.gallery,
      socialLinks: home.socialLinks,
      verifiedDate: home.verifiedDate,
      joinedDate: home.joinedDate,
      paymentAccountChecked: home.paymentAccountConfirmed,
      updatesCount: counts.get(home.id),
    },
    needs: all.filter((n) => n.status === 'open' && n.raised < n.goal).map(toNeed),
    metNeeds: all.filter((n) => n.raised >= n.goal).map(toNeed),
    record: await donations.totalsForOrphanage(home.id),
  };
}

// The stories, updates and videos a listed orphanage shares, with its social pages.
async function updatesFor(orphanageId) {
  const home = await listedHome(orphanageId);
  if (!home) return null;
  return { orphanage: { id: home.id, name: home.name }, socialLinks: home.socialLinks, posts: await posts.forOrphanage(home.id) };
}

module.exports = { forSupporters, updatesFor };
