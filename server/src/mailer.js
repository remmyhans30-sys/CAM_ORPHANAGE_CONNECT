const nodemailer = require('nodemailer');

// Sends the site's emails (password resets). On the live site set SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASSWORD and SMTP_FROM (see DEPLOY.md). On your own computer, without
// SMTP settings, the email is printed in the server window instead, so you can still test.

let transport = null;

function configured() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
    });
  }
  return transport;
}

// Can the site actually deliver mail to people right now?
function canDeliver() {
  return configured();
}

// Local runs without SMTP settings may print mail to the console; the live site never does.
function canPrintToConsole() {
  return !configured() && process.env.NODE_ENV !== 'production';
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'CAM Orphanage Connect <noreply@camorphanage.local>';
  if (configured()) {
    await getTransport().sendMail({ from, to, subject, text, html });
    return { sent: true };
  }
  if (canPrintToConsole()) {
    console.log('\n--- Email (not sent: no SMTP settings, printing instead) ---');
    console.log('To: ' + to + '\nSubject: ' + subject + '\n\n' + text + '\n------------------------------------------------------------\n');
    return { printed: true };
  }
  throw new Error('Email is not set up on this server.');
}

module.exports = { sendMail, canDeliver, canPrintToConsole };
