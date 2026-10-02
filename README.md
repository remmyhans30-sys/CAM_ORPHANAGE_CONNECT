# CAM Orphanage Connect

A platform that connects donors with verified orphanages in Cameroon.

## Put it online

See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions to put the site online for free on alwaysdata, so anyone can open it in Chrome or Edge.

## Run it on your own computer

You need two things installed:

- **Node.js 18 or newer** (the LTS version from https://nodejs.org).
- **MySQL Server 8.0.16 or newer**, the same server MySQL Workbench connects to. Make sure it is running (on Windows: `services.msc`, find `MySQL80` or `MySQL81`, Start).

- **Windows:** double-click `start.bat`.
- **Mac / Linux:** run `node server/start.js` from this folder.

The site opens at **http://localhost:4000**. Keep the black window open while you use it, and close it to stop the site.

The first run needs internet for about a minute to install packages. It asks once for your MySQL user and password (the ones you use in MySQL Workbench), saves them with a secret key in `server/.env` (never uploaded to GitHub), and **creates the database `cam_orphanage_connect` by itself** from `database/cam_orphanage_connect.sql`. Open MySQL Workbench afterwards, refresh the Schemas list, and you can see every account, pledge and message the site stores. See `database/README.md` for the table layout.

## The public website

The home page shows live figures from the platform (verified orphanages, open needs, pledges, approved donors, verified partners) and the contact page shows the details saved in the admin **Settings** page, so both stay current without editing any page. The "Join" buttons open the sign-up page with the right account type already chosen.

Photographs come from Wikimedia Commons under free licenses and are credited on `credits.html`. When you add a photo, add its credit there too. Fonts are Bitter (headings) and Source Sans 3 (text); icons are Bootstrap Icons. The design uses the colours of the Cameroonian flag.

## Accounts

| Who | How to sign in |
|---|---|
| Donors and orphanages | Sign up on the site (**Sign Up** on the home page). |
| Admin | **Admin sign-in** at the bottom of the login page. On your own computer the default account is `admin@camorphanage.org` / `ChangeMe123!`. The live site uses the admin email and password set during deployment instead. |

To start over with an empty database, stop the site, run `DROP DATABASE cam_orphanage_connect;` in MySQL Workbench, and start the site again. It builds a fresh one.

## What each type of user fills in

Everyone signs up on the same page, then completes a profile. The admin only sees an orphanage or partner in the verification queue after they press **Submit for verification**, so the team reviews finished applications.

| Account | What they complete before submitting |
|---|---|
| **Orphanage** | Name, location, official registration number, children in care, contact person and phone, story, at least one verification document, and agreement to the terms. Optional: photo, cover photo, capacity, payment account. |
| **Partner** | Organization name and type, country, contact person, at least one verification document, and agreement to the terms. Optional: logo, public "Sponsored by" message, a matching pledge. |
| **Donor** | Optional profile: location, preferred payment method and currency, photo. Donors appear on the admin Donors page right away, as "Awaiting approval", with their pledges. |

**Nobody browses orphanages until an admin approves them.** A new donor stays "Awaiting approval" until an admin approves them on the Donors page; a partner must be "Verified". Until then, visitors, pending donors and unverified partners see a message instead of the orphanages, and the server refuses to send the data.

Documents (PDF, JPG or PNG, up to 3 MB) are private: only the owner and admins can open them. Photos are public.

## Messages

- **Everyone can message the CAM Orphanage Connect team**, even while waiting for approval. Admins start or answer these in the **Support Center** (`admin/messages.html`), which lists a thread with every donor, orphanage and partner.
- **Orphanages chat directly with donors and partners.** Donors start a chat from an orphanage's card ("Message this orphanage"). Orphanages can message verified partners and donors who have given to them under their own name. Both sides must be approved (verified orphanage, active donor, verified partner).
- **Admins can read every direct chat** on the **Chat Monitor** page (`admin/conversations.html`), step in as the team, and remove a message.
- Messages are plain text up to 2,000 characters, and sending too fast is slowed down.

Everyone uses the same chat window (conversation list on the left, messages on the right, unread dots): orphanages under **Messages** in the portal, donors in the **Messages** menu, partners under **Messages** in their portal, and admins in the **Support Center** (one thread per profile, with status and priority) and the **Chat Monitor**.

## Visit requests

Approved donors and verified partners can ask to visit an orphanage: **Request a visit** on an orphanage card (donors) or on its page (partners). They choose a date (from tomorrow, up to a year ahead), the number of visitors and an optional message. The orphanage answers from **Visit Requests** in its portal, approving or declining (a reason is required to decline). Visits are meant to be supervised by the home's staff; the form says so. The visitor's email is shown to the orphanage only after it approves. Visitors follow their requests under "My visit requests", and admins see every request, read-only, on **Visit Requests** in the admin sidebar.

## Forgot password

"Forgot password?" on the sign-in page emails a link that works for one hour and once. It works for donors, orphanages and partners; admins change passwords on the Users page. The site answers everyone the same way, so nobody can use it to find out who has an account, and it allows at most 3 emails per account per hour.

- **On your own computer** there is no email service, so the link is printed in the black server window. Copy it into the browser.
- **On the live site** set the `SMTP_*` and `SITE_URL` settings described in `DEPLOY.md`. Until they are set, the page honestly tells people to contact the team.

## Terms and privacy

Sign-up requires ticking that the person is 18 or older and agrees to the terms of use (`terms.html`) and has read the safeguarding and privacy summary (`safeguarding.html`). The agreement is written into the account's history. These pages are written in plain language by the team and have **not** been reviewed by a lawyer. `LEGAL-REVIEW.md` explains what the site does with data and lists the questions to take to a lawyer before promoting the site.

## How it fits together

1. An orphanage signs up, completes its profile checklist in the **orphanage portal** and submits it.
2. An admin reviews it on the **verification** page, opens its documents, and approves, rejects or asks for more information.
3. Once approved, the orphanage and its needs appear on the **donor page**, for approved donors and verified partners only.
4. Approved donors **pledge** to a need. A pledge is a promise to give; no money is charged on this site. Each pledge counts toward the need's progress.
5. The orphanage sees the decision and the pledges it received in its portal.

## Project layout

| Folder | What it is |
|---|---|
| `index.html` and the other pages in the root | The public website: home, how it works, pages for donors, orphanages and partners, about, FAQ, contact, safeguarding and privacy, terms, photo credits |
| `assets/` | `site.css` and `site.js` (shared design, header, footer and live numbers) and `img/` (photographs) |
| `login/` | Sign in, sign up, forgot password, choose a new password |
| `donor/` | Donor page: verified orphanages, their needs, and pledges |
| `shared/` | The chat window (`chat.js`, `chat.css`, `chat-api.js`) and the visit-request form and list (`visits.js`, `visits.css`), used by the portals and admin |
| `orphanage/` | Orphanage portal: profile, needs, verification status |
| `admin/` | Admin panel: dashboard, verification, donors, finance and more |
| `partner/` | Partner portal: profile and verification, browse orphanages, messages |
| `server/` | Backend API and database. See `server/README.md` |
