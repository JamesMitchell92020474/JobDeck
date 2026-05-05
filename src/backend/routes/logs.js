const express = require('express');
const { getLogs } = require('../services/logger');

const router = express.Router();

router.get('/', (req, res) => {
  const { type, trigger, from, to, limit } = req.query;
  res.json(getLogs({ type, trigger, from, to, limit: limit ? Number(limit) : 200 }));
});

module.exports = router;
