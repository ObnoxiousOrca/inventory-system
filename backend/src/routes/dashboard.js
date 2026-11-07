'use strict';

const express = require('express');
const service = require('../services/inventoryService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.getDashboard());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
