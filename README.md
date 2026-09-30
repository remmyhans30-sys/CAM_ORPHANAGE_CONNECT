# CAM Orphanage Connect

A platform that connects donors with verified orphanages in Cameroon.

## Run the website

You need **Node.js 22.5 or newer**. Install the LTS version from https://nodejs.org if you don't have it.

- **Windows:** double-click `start.bat`.
- **Mac / Linux:** run `node server/start.js` from this folder.

The site opens at **http://localhost:4000**. Keep the black window open while you use it, and close it to stop the site.

The first run needs internet for about a minute to install packages. It also creates the database (`server/data.sqlite`) and a secret key (`server/.env`) on your computer. Neither is uploaded to GitHub.

## Accounts

| Who | How to sign in |
|---|---|
| Donors and orphanages | Sign up on the site (**Sign Up** on the home page). |
| Admin | **Admin sign-in** at the bottom of the login page. Default account: `admin@camorphanage.org` / `ChangeMe123!` |

To start over with an empty database, stop the site, delete `server/data.sqlite`, and start it again.

## How it fits together

1. An orphanage signs up and fills in its profile and needs in the **orphanage portal**.
2. An admin reviews it on the **verification** page and approves or rejects it.
3. The orphanage sees the decision in its portal.

## Project layout

| Folder | What it is |
|---|---|
| `index.html`, `assets/` | Public home page |
| `login/` | Sign in, sign up, forgot password |
| `donor/`, `shared/` | Donor page and its sample data |
| `orphanage/` | Orphanage portal: profile, needs, verification status |
| `admin/` | Admin panel: dashboard, verification, donors, finance and more |
| `partner/` | Partner login and portal |
| `server/` | Backend API and database. See `server/README.md` |
