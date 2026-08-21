const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const WEBHOOK_SECRET = 'solstice_secret_key_2026';

// Middleware to retain raw body buffer for HMAC verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// In-Memory Database
const db = {
  attendees: {
    'ATT-001': { id: 'ATT-001', name: 'Alice Smith', status: 'NOT_CHECKED_IN' },
    'ATT-002': { id: 'ATT-002', name: 'Bob Jones', status: 'NOT_CHECKED_IN' },
    'ATT-003': { id: 'ATT-003', name: 'Charlie Brown', status: 'CHECKED_IN' } // Duplicate test case
  },
  printJobs: {},
  processedWebhooks: new Set()
};

// -------------------------------------------------------------------
// DAY 3 (DEPRECATED): Original Synchronous API
// -------------------------------------------------------------------
/**
 * @deprecated Deprecated on Day 4 due to vendor API deprecation.
 * Use POST /api/checkin instead.
 */
app.post('/api/legacy-checkin', (req, res) => {
  const { attendeeId } = req.body;
  const attendee = db.attendees[attendeeId];

  if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
  if (attendee.status === 'CHECKED_IN') {
    return res.status(400).json({ error: 'Duplicate Scan: Attendee already checked in' });
  }

  // Simulate synchronous REST call delay to badge printer vendor
  attendee.status = 'CHECKED_IN';
  return res.json({ message: 'Checked In', status: attendee.status });
});

// -------------------------------------------------------------------
// DAY 4 PIVOT: Asynchronous Queue & Webhook Architecture
// -------------------------------------------------------------------

// 1. Kiosk Check-In Request Endpoint
app.post('/api/checkin', (req, res) => {
  const { attendeeId } = req.body;
  const attendee = db.attendees[attendeeId];

  if (!attendee) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  // Duplicate protection: Block scan if already pending or checked in
  if (attendee.status === 'CHECKED_IN' || attendee.status === 'PENDING') {
    return res.status(400).json({ 
      error: 'Duplicate Scan Protection: Attendee is already checked in or pending print.' 
    });
  }

  // Generate Print Job
  const jobId = `JOB-${Date.now()}`;
  attendee.status = 'PENDING';
  db.printJobs[jobId] = { jobId, attendeeId, status: 'PENDING' };

  console.log(`[CHECK-IN] Attendee ${attendeeId} set to PENDING. Job ${jobId} published to queue.`);

  // Immediately respond with pending state
  return res.status(202).json({
    status: 'PENDING',
    jobId,
    message: 'Badge print job queued. Awaiting printer callback.'
  });
});

// 2. Webhook Callback Receiver Endpoint from Printer Vendor
app.post('/api/webhooks/printer', (req, res) => {
  const signature = req.headers['x-printer-signature'];
  const eventId = req.headers['x-event-id'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing HMAC signature header' });
  }

  // Signature verification
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('[SECURITY] Webhook signature mismatch!');
    return res.status(403).json({ error: 'Invalid HMAC signature' });
  }

  // Idempotency / Out-of-order check
  if (eventId && db.processedWebhooks.has(eventId)) {
    console.log(`[WEBHOOK] Duplicate event ${eventId} ignored.`);
    return res.status(200).json({ message: 'Event already processed' });
  }

  const { jobId, attendeeId, status } = req.body;
  const attendee = db.attendees[attendeeId];
  const printJob = db.printJobs[jobId];

  if (!attendee || !printJob) {
    return res.status(404).json({ error: 'Associated print job or attendee not found' });
  }

  // Process status update
  if (status === 'SUCCESS') {
    attendee.status = 'CHECKED_IN';
    printJob.status = 'SUCCESS';
    console.log(`[WEBHOOK SUCCESS] Attendee ${attendeeId} status updated to CHECKED_IN.`);
  } else {
    attendee.status = 'NOT_CHECKED_IN';
    printJob.status = 'FAILED';
    console.log(`[WEBHOOK FAILED] Print job failed for ${attendeeId}. Status reverted.`);
  }

  if (eventId) db.processedWebhooks.add(eventId);

  return res.status(200).json({ received: true });
});

// Query Status Endpoint
app.get('/api/attendee/:id', (req, res) => {
  const attendee = db.attendees[req.params.id];
  if (!attendee) return res.status(404).json({ error: 'Not found' });
  return res.json(attendee);
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`Solstice Kiosk Service running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});