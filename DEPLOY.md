# Putting CAM Orphanage Connect online (alwaysdata, free plan)

This puts the whole site online at `https://ACCOUNT.alwaysdata.net`, where `ACCOUNT` is the account name you choose. Anyone can then open it in Chrome, Edge or any other browser. The free plan includes a MySQL database, which keeps all the site's data between restarts.

Replace `ACCOUNT` everywhere below with your account name.

## 1. Create the account

1. Sign up at https://www.alwaysdata.com and choose the **free** plan.
2. Pick the account name carefully: it becomes the web address (`ACCOUNT.alwaysdata.net`).

## 2. Choose the Node.js version

In the alwaysdata admin panel, go to **Environment > Node.js** and set the default version to **24** (or 22). The site needs Node.js 18 or newer.

## 3. Turn on SSH

Go to **Remote access > SSH**, edit the user, and enable **password login**.

## 4. Upload the code

Open a terminal on the server, in one of two ways:
- **In the browser:** go to `https://ssh-ACCOUNT.alwaysdata.net`.
- **From a computer's terminal:** run `ssh ACCOUNT@ssh-ACCOUNT.alwaysdata.net`.

Log in with the SSH password, then run:

```bash
git clone https://github.com/remmyhans30-sys/CAM_ORPHANAGE_CONNECT.git site
cd site/server
npm install --omit=dev
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The last command prints a long random line. Copy it: it's the site's secret key (`JWT_SECRET`). Don't share it or put it on GitHub.

## 5. Create the MySQL database

In the alwaysdata panel go to **Databases > MySQL**.

1. **Add a database** (any name; alwaysdata prefixes it with your account name, for example `ACCOUNT_camorphanage`).
2. Under **Users**, **add a user** with a strong password, and give it **full rights on that database**.
3. Note the server address shown on the page (it looks like `mysql-ACCOUNT.alwaysdata.net`).

The site builds all its tables by itself the first time it starts. Nothing else to run.

## 6. Create the website

Go to **Web > Sites > Add a site** and fill in:

| Field | Value |
|---|---|
| Addresses | `ACCOUNT.alwaysdata.net` |
| Type | **Node.js** |
| Command | `node /home/ACCOUNT/site/server/src/index.js` |
| Working directory | `/home/ACCOUNT/site/server` |
| Environment | see below |

Environment, one setting per line:

```
NODE_ENV=production
JWT_SECRET=the-long-line-from-step-4
DB_HOST=mysql-ACCOUNT.alwaysdata.net
DB_USER=the-mysql-user-from-step-5
DB_PASSWORD=the-mysql-password-from-step-5
DB_NAME=ACCOUNT_camorphanage
ADMIN_EMAIL=the-admin's-email
ADMIN_PASSWORD=a-strong-password
SEED_SAMPLE_DATA=false
SUPPORT_EMAIL=an-email-people-can-contact
VIDEO_MAX_MB=8
ORPHANAGE_VIDEO_QUOTA_MB=24
SITE_URL=https://ACCOUNT.alwaysdata.net
SMTP_HOST=smtp-ACCOUNT.alwaysdata.net
SMTP_PORT=587
SMTP_USER=the-mailbox-address-from-step-7
SMTP_PASSWORD=the-mailbox-password
SMTP_FROM=CAM Orphanage Connect <the-mailbox-address-from-step-7>
```

- On the first start, `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the first admin account. Use a strong password of at least 8 characters, and share it with no one who shouldn't be an admin.
- Don't set `PORT` or `IP`: alwaysdata provides them.

If the site has an **SSL** tab, turn on **Force HTTPS**. Save.

## 7. Set up email (confirmation, password reset, notifications)

New accounts get a link to confirm their email address, "Forgot password?" emails people a link, and the site emails people about things that concern them (account approved, verification decisions, new pledges, gifts received, visit requests and answers), so it needs a mailbox to send from. Until you do this step, nobody is asked to confirm their address, the forgot-password page tells people to contact the team instead, and no notifications are sent. Once it is done, admins can approve an account only after its address is confirmed.

1. In the alwaysdata panel go to **Emails > Mailboxes** and add a mailbox, for example `noreply@ACCOUNT.alwaysdata.net`, with a strong password.
2. Put its address and password in the environment settings of the site (step 6): `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. The server address for `SMTP_HOST` is shown on the Emails page (it looks like `smtp-ACCOUNT.alwaysdata.net`, port 587).
3. Set `SITE_URL` to the site's real address, exactly as people type it, with no slash at the end. The links in the emails point there.
4. Restart the site, then try "Forgot password?" with your own address, and sign up a test account to see the confirmation email arrive.

Accounts that signed up before this step have no confirmed address yet. Approved ones keep working; anyone still waiting for approval is asked to confirm first, and can get a link with **Send the link again** on their page.

## 8. Watch the disk space (videos)

Orphanages can upload short videos. The free plan has about 100 MB of disk space in total, shared by the code, the database and every uploaded document, photo and video, so the settings above keep videos small (8 MB each, 24 MB per orphanage). If you see the disk filling up, lower `ORPHANAGE_VIDEO_QUOTA_MB`, ask homes to put longer videos on YouTube and share the link in a post, or move to a paid plan. The panel shows the space used under **Account**.

## 9. Check it

- Open `https://ACCOUNT.alwaysdata.net`. The home page should appear.
- Click **Sign In**, then **Admin sign-in**, and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Sign up as an orphanage in another browser (or a private window), then approve it as the admin. It should appear on the donor page (`/donor/index.html`).

If the site doesn't start, check its logs in your account's `admin/logs` folder (over SSH) or in the site's page in the panel. The usual cause is a missing or too-short `JWT_SECRET`, a wrong `DB_HOST`, `DB_USER`, `DB_PASSWORD` or `DB_NAME`, or a Node.js version older than 18. The log says "Could not use the MySQL database" when the database settings are the problem.

## Updating the live site

After new work is merged into `main` on GitHub, update the live site over SSH:

```bash
cd ~/site && git pull && cd server && npm install --omit=dev
```

Then restart the site from **Web > Sites**. The database is kept.

## Backups

All accounts, orphanages, needs, pledges and messages are in the MySQL database. Export it regularly: in the alwaysdata panel open **Databases > MySQL** and use the phpMyAdmin link, then **Export**. The documents and photos people upload are in the folder `/home/ACCOUNT/site/server/uploads/`. The free plan keeps 3 days of backups. Also download a copy of **both** regularly (the database export and the uploads folder over SFTP, for example with FileZilla to `ssh-ACCOUNT.alwaysdata.net`). They belong together: a backup of one without the other leaves documents or photos missing.
