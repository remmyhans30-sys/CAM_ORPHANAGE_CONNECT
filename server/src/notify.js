const db = require('./db');
const mailer = require('./mailer');

// Short emails that tell people about things that concern them:
//   - donors: their account was approved (or not), a home received their pledged gift, a visit was answered
//   - orphanages and partners: the team's verification decision
//   - orphanages: a new pledge, a new visit request
// Sending never holds up or breaks the action itself: the email goes out just after the answer, and a
// problem is only written to the server log. Without SMTP settings, local copies print the email in
// the server window and the live site sends nothing. Accounts an admin created without a login (an
// address ending in .invalid) get nothing.

function formatXAF(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' XAF';
}

function prettyDate(value) {
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? String(value) : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function deliver(to, subject, paragraphs) {
  if (!to || /\.invalid$/i.test(to)) return Promise.resolve();
  if (!mailer.canDeliver() && !mailer.canPrintToConsole()) return Promise.resolve();
  const site = mailer.siteUrl();
  const text = paragraphs.join('\n\n') + '\n\nCAM Orphanage Connect\n' + site;
  const html = paragraphs.map((p) => '<p>' + escapeHtml(p) + '</p>').join('') +
    '<p>CAM Orphanage Connect<br><a href="' + escapeHtml(site) + '">' + escapeHtml(site) + '</a></p>';
  return mailer.sendMail({ to, subject, text, html });
}

// Runs a notification after the current request, without letting it fail the request.
function later(task) {
  setImmediate(() => {
    Promise.resolve().then(task).catch((err) => console.error('Could not send a notification email: ' + err.message));
  });
}

const signIn = () => 'Sign in: ' + mailer.siteUrl() + '/login/index.html';

// ---- account decisions ------------------------------------------------------------

function donorDecision(userId, status, reason) {
  later(async () => {
    const user = await db.one('SELECT email, display_name FROM users WHERE id = ?', [userId]);
    if (!user) return;
    if (status === 'active') {
      await deliver(user.email, 'Your donor account is approved', [
        'Hello ' + user.display_name + ',',
        'Good news: the CAM Orphanage Connect team has approved your donor account. You can now read the profiles of verified orphanages and pledge to their needs.',
        signIn(),
      ]);
    } else if (status === 'rejected') {
      await deliver(user.email, 'About your donor account', [
        'Hello ' + user.display_name + ',',
        'The CAM Orphanage Connect team could not approve your donor account' + (reason ? ': ' + reason : '.'),
        'If you think this is a mistake, please write to the team through the contact page on the site.',
      ]);
    }
  });
}

function orphanageDecision(orphanageId, status) {
  later(async () => {
    const home = await db.one(
      `SELECT o.name, o.info_request_message, o.rejection_reason, u.email
       FROM orphanages o JOIN users u ON u.id = o.owner_user_id WHERE o.id = ?`, [orphanageId]);
    if (!home) return;
    if (status === 'verified') {
      await deliver(home.email, home.name + ' is verified', [
        'Good news: the CAM Orphanage Connect team has verified ' + home.name + '.',
        'Approved donors and verified partners can now see your profile, read your stories and pledge to your needs. Keep your needs and stories up to date in your portal.',
        signIn(),
      ]);
    } else if (status === 'needs-info') {
      await deliver(home.email, 'More information needed for ' + home.name, [
        'The CAM Orphanage Connect team needs a little more information before it can verify ' + home.name + '.',
        home.info_request_message ? 'The team wrote: ' + home.info_request_message : 'Please check your portal for what is missing.',
        'Update your profile in your portal and submit it again. ' + signIn(),
      ]);
    } else if (status === 'rejected') {
      await deliver(home.email, 'About the verification of ' + home.name, [
        'The CAM Orphanage Connect team could not verify ' + home.name + (home.rejection_reason ? ': ' + home.rejection_reason : '.'),
        'You can write to the team from Messages in your portal.',
      ]);
    }
  });
}

function partnerDecision(partnerId, status) {
  later(async () => {
    const org = await db.one(
      `SELECT p.name, p.info_request_message, p.rejection_reason, u.email
       FROM partner_organizations p JOIN users u ON u.id = p.owner_user_id WHERE p.id = ?`, [partnerId]);
    if (!org) return;
    if (status === 'verified') {
      await deliver(org.email, org.name + ' is verified', [
        'Good news: the CAM Orphanage Connect team has verified ' + org.name + '.',
        'You can now browse verified orphanages, read their full profiles, message them and record your gifts.',
        'Sign in: ' + mailer.siteUrl() + '/partner/index.html',
      ]);
    } else if (status === 'needs-info') {
      await deliver(org.email, 'More information needed for ' + org.name, [
        'The CAM Orphanage Connect team needs a little more information before it can verify ' + org.name + '.',
        org.info_request_message ? 'The team wrote: ' + org.info_request_message : 'Please check your partner portal for what is missing.',
        'Sign in: ' + mailer.siteUrl() + '/partner/index.html',
      ]);
    } else if (status === 'rejected') {
      await deliver(org.email, 'About the verification of ' + org.name, [
        'The CAM Orphanage Connect team could not verify ' + org.name + (org.rejection_reason ? ': ' + org.rejection_reason : '.'),
        'You can write to the team from Messages in your partner portal.',
      ]);
    }
  });
}

// ---- pledges ----------------------------------------------------------------------

const PLEDGE = `
  SELECT d.id, d.amount, d.is_anonymous, n.title AS need_title, o.name AS home_name,
         home_user.email AS home_email, giver.email AS giver_email, giver.display_name AS giver_name
  FROM donations d
  JOIN orphanages o ON o.id = d.orphanage_id
  JOIN users home_user ON home_user.id = o.owner_user_id
  JOIN users giver ON giver.id = d.giver_user_id
  LEFT JOIN needs n ON n.id = d.need_id
  WHERE d.id = ?`;

// To the home: who pledged (unless they asked to stay anonymous), how much, and the reference.
function newPledge(donationId) {
  later(async () => {
    const p = await db.one(PLEDGE, [donationId]);
    if (!p) return;
    const reference = 'CAM-' + p.id;
    await deliver(p.home_email, 'New pledge ' + reference + ': ' + formatXAF(p.amount), [
      (p.is_anonymous ? 'A donor who chose to stay anonymous' : p.giver_name) + ' pledged ' + formatXAF(p.amount) +
        (p.need_title ? ' for "' + p.need_title + '"' : '') + ' at ' + p.home_name + '. Reference: ' + reference + '.',
      'The donor sends the money directly to your confirmed payment account, with the reference in the payment note. When it arrives, open Pledges Received in your portal and click "Mark as received".',
      signIn(),
    ]);
  });
}

// To the donor: the home says the gift has arrived.
function pledgeReceived(donationId) {
  later(async () => {
    const p = await db.one(PLEDGE, [donationId]);
    if (!p) return;
    await deliver(p.giver_email, p.home_name + ' received your gift', [
      'Hello ' + p.giver_name + ',',
      p.home_name + ' has confirmed it received your gift of ' + formatXAF(p.amount) + (p.need_title ? ' for "' + p.need_title + '"' : '') + ' (reference CAM-' + p.id + '). Thank you!',
      'You can follow the home\'s stories and updates on its profile.',
    ]);
  });
}

// ---- visits -----------------------------------------------------------------------

const VISIT = `
  SELECT v.id, v.preferred_date, v.visitors_count, v.status, v.response_note, o.name AS home_name,
         home_user.email AS home_email, requester.email AS requester_email, requester.display_name AS requester_name
  FROM visit_requests v
  JOIN orphanages o ON o.id = v.orphanage_id
  JOIN users home_user ON home_user.id = o.owner_user_id
  JOIN users requester ON requester.id = v.requester_user_id
  WHERE v.id = ?`;

// To the home. The visitor's email is not included: the home gets it only once it approves.
function visitRequested(visitId) {
  later(async () => {
    const v = await db.one(VISIT, [visitId]);
    if (!v) return;
    await deliver(v.home_email, 'New visit request for ' + v.home_name, [
      v.requester_name + ' would like to visit ' + v.home_name + ' on ' + prettyDate(v.preferred_date) + ' with ' +
        v.visitors_count + (v.visitors_count === 1 ? ' visitor.' : ' visitors.'),
      'Open Visit Requests in your portal to approve or decline it. ' + signIn(),
    ]);
  });
}

// To the visitor: the home's answer.
function visitAnswered(visitId) {
  later(async () => {
    const v = await db.one(VISIT, [visitId]);
    if (!v || !['approved', 'declined'].includes(v.status)) return;
    const when = prettyDate(v.preferred_date);
    await deliver(v.requester_email, v.status === 'approved' ? 'Your visit to ' + v.home_name + ' is approved' : 'About your visit to ' + v.home_name,
      v.status === 'approved'
        ? ['Hello ' + v.requester_name + ',', v.home_name + ' approved your visit on ' + when + '.' + (v.response_note ? ' The home wrote: ' + v.response_note : ''),
          'The home now has your email address and may contact you to arrange the details. Visits are always supervised by the home\'s staff.']
        : ['Hello ' + v.requester_name + ',', v.home_name + ' could not accept your visit on ' + when + '.' + (v.response_note ? ' The home wrote: ' + v.response_note : ''),
          'You are welcome to ask for another date.']);
  });
}

module.exports = { donorDecision, orphanageDecision, partnerDecision, newPledge, pledgeReceived, visitRequested, visitAnswered };
