const express = require('express');
const { runHousekeeping } = require('../services/housekeeping');

const router = express.Router();

router.post('/run', (req, res) => {
  try {
    const results = runHousekeeping('MANUAL');
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
