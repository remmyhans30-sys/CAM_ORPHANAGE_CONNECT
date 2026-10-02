# CAM Orphanage Connect: MySQL database

`cam_orphanage_connect.sql` builds the whole database from nothing: 37 tables, 14 triggers and 7 views, plus the reference data (the ten regions of Cameroon, languages, currencies, payment methods, categories, admin roles).

Requires **MySQL 8.0.16 or newer** (the script uses CHECK constraints). It was tested on MySQL 8.0.46.

## Create it in MySQL Workbench

1. Open MySQL Workbench and double-click your local connection (usually `Local instance MySQL81`). Enter the root password.
2. **File > Open SQL Script...** and pick `database/cam_orphanage_connect.sql`.
3. Click the lightning-bolt button (**Execute**) or press `Ctrl+Shift+Enter`.
4. At the bottom you should see: `cam_orphanage_connect is ready | tables 37 | views 7 | triggers 14`.
5. In the left **Schemas** panel, click the refresh icon. Open `cam_orphanage_connect > Tables` to browse.

Running the script again **deletes and recreates** the database (it starts with `DROP DATABASE IF EXISTS`). Do not run it on a database holding real data.

## See the diagram

**Database > Reverse Engineer...**, choose your connection, tick `cam_orphanage_connect`, and keep clicking Next. Workbench draws every table and relationship (EER diagram). Use **File > Export > Export as PNG** to put it in the report.

## Create the first administrator

```
node database/make-admin-sql.js you@example.com "Your Name" "a strong password"
```

Paste the printed SQL into a new Workbench query tab and run it. Nothing in the database contains a default password.

## How it is organised

| Group | Tables |
|-------|--------|
| Reference lists | regions, languages, currencies, payment_methods, organization_types, categories, admin_roles |
| Accounts | **users** (one login table for everybody, with a `role`), uploads, admin_profiles, donor_profiles |
| Orphanages | orphanages, orphanage_payment_accounts, orphanage_photos, orphanage_posts, visit_requests |
| Partners | partner_organizations, verification_documents, partner_sponsorships, matching_pledges, placement_referrals |
| Giving | programs, program_items, needs, donations, recurring_gifts, follows |
| Messaging | conversations, messages, conversation_reads, notifications |
| Safety and admin | abuse_reports, appeals, audit_log, password_reset_tokens, organization_settings |

Every login (admin, donor, orphanage, partner) is one row in `users`. The role decides which profile table holds the rest of their details. Orphanages and partners both go through `draft > pending > needs_info > verified / rejected`; donors go through `pending > active / flagged / rejected`.

### Views the website can read

| View | Used for |
|------|----------|
| v_site_stats | The live numbers on the home page |
| v_public_orphanages | The public orphanage list (verified only) |
| v_need_progress | Pledged amount, percent and supporters for each need |
| v_donor_summary, v_partner_summary | Totals on donor and partner dashboards |
| v_review_queue | The admin list of orphanages and partners waiting for review |
| v_support_inbox | The admin direct-message inbox with unread flags |

## Rules the database enforces by itself

The database refuses these even if the website code has a bug:

- two accounts with the same email (capital letters ignored)
- an orphanage owned by a donor, a donor profile on an orphanage login, and similar role mix-ups
- an orphanage or partner marked verified without a registration number, terms acceptance or review date
- a pledge from a donor who is not approved, from an unverified partner, or to an unverified orphanage
- a pledge to a closed need, or larger than what the need still requires
- a gift of zero, or an item gift with no description
- a document attached to both or neither of an orphanage and a partner; files over 3 MB
- chats between two donors, a second chat between the same two people, messages from people outside the chat, staff messages from non-admins, empty messages or ones over 2000 characters
- deleting a donor, orphanage or need that already has gifts (history is kept)

Money is stored as whole numbers in XAF (no decimals). No table stores information about individual children.

## How the website uses it

The website (`server/`) runs on this database. On first start it creates the database from `cam_orphanage_connect.sql` by itself (only when the database is missing or empty, never over existing data), so you do not have to run the script by hand. Running it in MySQL Workbench is still the way to look at the design, draw the diagram, or rebuild a clean database.

Two things the website does not store, because the database works them out:

- **How much a need has raised.** Each need keeps a running total that only the triggers on `donations` change (`needs.pledged_amount`). Pledging locks that one row, so ten people pledging at the same moment can never over-fill a need. This was tested with ten simultaneous pledges to a 100,000 XAF need: exactly two of 40,000 were accepted.
- **The numbers on the home page.** They come from the `v_site_stats` view.

Records an admin adds by hand (an orphanage, a donor or a partner without a sign-up) still need an owner login, so the site creates one that nobody can sign in to. It uses the contact email if that is free, otherwise a made-up `...@no-login.invalid` address. For real people it is better to ask them to sign up themselves.

Stories, updates and videos are in `orphanage_posts` (a type, a title, an optional photo and video; only a verified orphanage may post, enforced by a trigger), and a home's own social pages in `orphanage_social_links`. The video files stay on disk like other uploads; the database keeps their details.

**Changing the database later.** Changes made after the first version live in `server/src/migrations/`. The site applies each one, once, the next time it starts, and records it in `schema_migrations`, so an existing database is upgraded without losing data. A brand new database already includes them. When you add a migration, put the same change in `cam_orphanage_connect.sql` too.

Visit requests (`visit_requests`) and password reset links (`password_reset_tokens`, stored only as a fingerprint) are used by the site too. `users.email_verified_at` records when someone confirmed their email address with the link sent at sign-up; the trigger on `users` clears it when the address changes, so a new address has to be confirmed again.

Deleting is blocked for anything that has donations (donors, partners, orphanages, needs): the money history is kept. Admins can flag or reject them instead.
