# Automated tests

These tests use the site the way people do: they sign up, get approved, pledge, post stories and videos, ask to visit, chat, reset passwords and so on, through the API and in a real (hidden) browser. Run them before you push a change, to see that nothing else broke.

| Suites | What they check |
|---|---|
| `gate-*`, `consent`, `login-guard` | Who may see what: approval before browsing, the sign-up agreement, limits on wrong passwords |
| `orphanage-*`, `donor-*`, `partner-*`, `admin-crud` | Each kind of account: profiles, uploads, verification, the admin pages |
| `profile-*`, `partner-profile-ui` | The full orphanage profile that donors and partners read before giving |
| `pledge-journey`, `race` | Pledging, where to send the gift, "Mark as received", and that a need is never over-filled |
| `posts-*`, `flag-hide` | Stories and videos, social links, homes hidden while flagged |
| `visits-*`, `chat-*` | Visit requests and messages |
| `reset`, `notify` | Password reset and notification emails |
| `public-flow`, `site-audit` | The public pages, and every page at phone, tablet and laptop width (no sideways scrolling, no errors) |

## What you need

- Node.js 22 or newer (the site itself runs on 18, but the browser tests use the WebSocket support that came with 22), and the site's own packages (`cd server`, `npm install`, as for running the site).
- MySQL running. The tests use the same MySQL login as the site (`server/.env`), but **their own database, `cam_orphanage_connect_test`, which is deleted and rebuilt every time**. Your real database is never touched. To use another server or login, set `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD` (and `TEST_DB_NAME`, which must end in `_test`).
- Microsoft Edge or Google Chrome (it runs hidden). Set `BROWSER` to its path if it is installed somewhere unusual.
- Once, in this folder: `npm install` (a small local mail server that catches the test emails).

The test site runs at `http://127.0.0.2:4555` with its own upload folder (`tests/.output/uploads`) and sends no real email, so it can run while your normal site is open. `127.0.0.2` works on Windows and Linux; on a Mac run `sudo ifconfig lo0 alias 127.0.0.2` first.

## Running them

From the project folder:

```
node tests/run-all.js
```

It takes about 25 minutes and ends with a summary. To run only some suites, name them: `node tests/run-all.js pledge-journey notify`.

Most suites end with **ALL PASSED** or say which check failed. The older ones print what they saw ("photo shown after upload: ...") instead; the summary still flags JavaScript errors, failed requests and crashes in those, and the full output of every suite is in `tests/.output/<suite>.log` (that folder is not saved in git).

## Writing a new test

Copy a suite in `suites/` that is close to what you need. `helpers/site.js` has the site's address and the test admin login, `helpers/browser.js` drives the hidden browser, `helpers/db.js` reads the test database directly, and `helpers/fixtures.js` makes small sample files to upload. Then add the suite's name to a group in `run-all.js`.
