const express = require('express');
const { runScrape } = require('../services/scraper');

const router = express.Router();

router.post('/', async (req, res) => {
  const { sources } = req.body;
  try {
    const results = await runScrape(sources || ['Seek', 'Trade Me Jobs', 'Jora', 'Indeed']);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
