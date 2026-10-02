# Briefing for a legal review

CAM Orphanage Connect connects donors and partner organizations with verified orphanages in Cameroon. The site handles people's personal data and is about children, so the wording on `terms.html` and `safeguarding.html` should be reviewed by a lawyer who knows Cameroonian law before the site is promoted publicly.

**This file is not legal advice.** It explains what the site does, so a lawyer can check the wording quickly, and lists the questions we could not answer ourselves. The two public pages were rewritten in plain language by the team to match what the site really does. They have not been checked by a lawyer.

## What the site does (facts a lawyer needs)

| Topic | What happens |
|---|---|
| Who uses it | Donors, orphanages, partner organizations (NGOs, companies, associations), and an admin team (students running the project). |
| Sign-up | Name, email, password. A required checkbox confirms the person is 18 or older and agrees to the terms and has read the safeguarding and privacy summary. The agreement is recorded in the account's history (version 1 of the terms). |
| Money | None. Donors make **pledges** (promises). The platform never collects, holds or moves money. Real payments may be added later, which would change many answers below. |
| Children | No personal data about individual children is stored anywhere. Orphanages only enter a head count. Photos are chosen by the orphanage and shown only on verified profiles; there is a "blur faces" privacy setting. |
| Documents | Orphanages and partners upload registration certificates, tax documents or an ID of the contact person (PDF/JPG/PNG, up to 3 MB). They are private: only the uploader and the admin team can open them. |
| Messages | Support chat with the admin team, and direct chats between an orphanage and a donor or partner. **Admins can read all direct chats** and can remove messages. Users are told this in the terms and the safeguarding summary. |
| Visits | Approved donors and verified partners can ask to visit an orphanage. The orphanage decides. The visitor's name and email are shared with the orphanage only after it approves. Admins can see all requests. |
| Other data stored | Pledges, profile details, time of last sign-in, and, for password reset requests, a fingerprint of the emailed link and the internet address of the request. Password hashes (bcrypt), never passwords. |
| Third parties | Hosting provider (planned: alwaysdata, France, free plan). An email service for password resets. Pages load fonts and icons from Google Fonts and jsDelivr. No advertising, analytics or tracking cookies. A sign-in token is kept in the browser's local storage. |
| Deleting data | On request through the team. Records of pledges are kept so the history of gifts stays accurate, and donors, orphanages, partners and needs that have gifts cannot be deleted from the database, only flagged or rejected. |
| Operator | The pages do not name a legal entity as the operator of the platform. See question 1. |

## Questions for the lawyer

1. **Who is the operator?** Which person or organization (the student group, the school, a registered association) is legally responsible for the platform, and how should the terms name it and give its contact details?
2. **Which laws apply?** We believe at least these are relevant, but we are not sure of the details, so please confirm and correct: Cameroon's cybersecurity and cybercrime law (2010), a personal-data protection law that we understand was adopted in late 2024, rules on orphanages and child protection (registration with or authorization from the Ministry of Social Affairs), and rules on associations/NGOs and on fundraising.
3. **Personal-data duties.** Do we need to register or notify an authority? Do we need a named data controller, a privacy contact, retention periods, a procedure for access, correction and deletion requests, and a breach procedure?
4. **Consent.** Is a required checkbox at sign-up with links to the terms enough? Is a separate consent needed for admins reading direct chats, or for sharing a visitor's email with an orphanage after approval?
5. **Reading private chats.** Is it acceptable for admins to read direct chats between users, given the notice we give? What wording and limits (who, when, why) do we need?
6. **Minimum age.** Is "18 or older" the right rule, and is a checkbox enough?
7. **Languages.** Cameroon is bilingual. Do the terms and privacy summary need an official French version, and which version prevails?
8. **Governing law and disputes.** What governing-law and dispute clauses should the terms contain? (We deliberately left them out.)
9. **Liability wording.** Is the "Our role" section (we verify to the best of our ability, we do not guarantee how gifts are used, we are not responsible for visits or arrangements made outside the platform) acceptable, or too weak or too broad?
10. **Pledges.** Is "a pledge is a promise to give and creates no legal obligation" correct under local law? Does fundraising by pledge need any authorization even though no money is handled?
11. **Child safety.** What should our visit and photo rules require (for example identity checks, police clearance, written consent for photos)? If someone reports abuse through the site, do we have a duty to report to the authorities, and to whom?
12. **Documents and IDs.** Are there special rules for storing copies of identity documents, and how long should we keep verification documents after an account is closed?
13. **Cross-border data.** Donors and partners may be abroad (including in the EU). Hosting is in France. What follows from that for the privacy summary?
14. **Local storage and fonts.** Do the browser sign-in token and the Google Fonts / jsDelivr requests need to be mentioned or consented to in a specific way? (We could host the fonts ourselves if that is simpler.)
15. **If real payments are added later,** what licences, agreements and wording will be needed?

## Where to look in the project

| What | Where |
|---|---|
| Terms of use | `terms.html` |
| Safeguarding and privacy summary | `safeguarding.html` |
| Sign-up agreement checkbox | `login/register.html` |
| Where agreement is recorded | The account's history (`audit_log`), written by `server/src/routes/users.js` and `partner-auth.js`; orphanages and partners also tick "Agree to the terms" in their portal checklist (`terms_accepted_at`) |
| What the database stores | `database/README.md` and `database/cam_orphanage_connect.sql` |

When the lawyer has made changes, update the pages, change the "last updated" date and the version number in the text and in `TERMS_NOTE` (`server/src/routes/users.js`), so the history shows which version each person agreed to.
