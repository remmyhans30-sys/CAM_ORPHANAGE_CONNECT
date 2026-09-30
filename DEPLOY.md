# Putting CAM Orphanage Connect online (alwaysdata, free plan)

This puts the whole site online at `https://ACCOUNT.alwaysdata.net`, where `ACCOUNT` is the account name you choose. Anyone can then open it in Chrome, Edge or any other browser. The free plan keeps files between restarts, so the database (`server/data.sqlite`) is saved.

Replace `ACCOUNT` everywhere below with your account name.

## 1. Create the account

1. Sign up at https://www.alwaysdata.com and choose the **free** plan.
2. Pick the account name carefully: it becomes the web address (`ACCOUNT.alwaysdata.net`).

## 2. Choose the Node.js version

In the alwaysdata admin panel, go to **Environment > Node.js** and set the default version to **24** (or 22). The site needs Node.js 22.5 or newer.

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

## 5. Create the website

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
ADMIN_EMAIL=the-admin's-email
ADMIN_PASSWORD=a-strong-password
SEED_SAMPLE_DATA=false
SUPPORT_EMAIL=an-email-people-can-contact
```

- On the first start, `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the first admin account. Use a strong password of at least 8 characters, and share it with no one who shouldn't be an admin.
- Don't set `PORT` or `IP`: alwaysdata provides them.

If the site has an **SSL** tab, turn on **Force HTTPS**. Save.

## 6. Check it

- Open `https://ACCOUNT.alwaysdata.net`. The home page should appear.
- Click **Sign In**, then **Admin sign-in**, and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Sign up as an orphanage in another browser (or a private window), then approve it as the admin. It should appear on the donor page (`/donor/index.html`).

If the site doesn't start, check its logs in your account's `admin/logs` folder (over SSH) or in the site's page in the panel. The usual cause is a missing or too-short `JWT_SECRET`, or a Node.js version older than 22.5.

## Updating the live site

After new work is merged into `main` on GitHub, update the live site over SSH:

```bash
cd ~/site && git pull && cd server && npm install --omit=dev
```

Then restart the site from **Web > Sites**. The database is kept.

## Backups

All accounts, orphanages, needs and pledges are in `/home/ACCOUNT/site/server/data.sqlite`. The free plan keeps 3 days of backups. Also download a copy regularly over SFTP, for example with FileZilla to `ssh-ACCOUNT.alwaysdata.net`.
