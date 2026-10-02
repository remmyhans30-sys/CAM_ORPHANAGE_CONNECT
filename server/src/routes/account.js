const express = require('express');
const { memberActor } = require('../middleware/memberActor');
const emailConfirmation = require('../emailConfirmation');

// Confirming the email address of a donor, orphanage or partner account (see emailConfirmation.js).
const router = express.Router();

const NEXT_STEP = {
  donor: 'The CAM Orphanage Connect team can now approve your donor account. You will get an email when they do.',
  orphanage: 'Once your profile checklist is complete, you can submit it for verification in your portal.',
  partner: 'Once your profile checklist is complete, you can submit it for verification on your profile page.',
};

// The page opened from the link in the email (login/confirm-email.html).
router.post('/confirm-email', async (req, res) => {
  const result = await emailConfirmation.confirm((req.body || {}).token);
  res.json({
    role: result.role,
    message: (result.alreadyConfirmed ? 'Your email address was already confirmed. ' : 'Thank you, your email address is confirmed. ') + NEXT_STEP[result.role],
  });
});

// "Send the link again", from the donor, orphanage and partner pages.
router.post('/confirm-email/resend', memberActor, async (req, res) => {
  const outcome = await emailConfirmation.send(req.actor.userId);
  if (outcome === 'limited') {
    return res.status(429).json({ error: 'We have already sent you several links in the last hour. Please use the newest one, or try again later.' });
  }
  if (outcome === 'unavailable') {
    return res.status(400).json({ error: 'We cannot send email from this site at the moment. Please contact the CAM Orphanage Connect team.' });
  }
  const messages = {
    sent: 'We have sent a new link to your email address. It works for ' + emailConfirmation.LINK_DAYS + ' days. Please check your spam folder too.',
    printed: 'Email is not set up on this computer, so nothing was sent: the link was printed in the black server window.',
    confirmed: 'Your email address is already confirmed.',
  };
  res.json({ outcome, message: messages[outcome] });
});

module.exports = router;
