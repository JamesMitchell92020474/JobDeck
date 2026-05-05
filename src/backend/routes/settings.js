const express = require('express');
const { getAllSettings, setSetting } = require('../db/database');
const { log } = require('../services/logger');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getAllSettings());
});

router.put('/', (req, res) => {
  const loggable = ['theme','accent_color','display_font','body_font','card_style','density'];
  for (const [key, value] of Object.entries(req.body)) {
    const prev = getAllSettings()[key];
    setSetting(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    if (loggable.includes(key) && prev !== String(value)) {
      log({ type: 'activity', trigger: 'MANUAL', action: 'SETTING-CHANGED', reason: `${key}: ${prev} → ${value}` });
    }
  }
  res.json({ ok: true });
});

module.exports = router;
