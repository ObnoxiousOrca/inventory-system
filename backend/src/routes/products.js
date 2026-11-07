'use strict';

const express = require('express');
const service = require('../services/inventoryService');
const { validate } = require('../middleware/validate');
const {
  createProductSchema,
  updateProductSchema,
  stockSchema,
  listQuerySchema,
  skuParamSchema,
} = require('../validation/schemas');

const router = express.Router();

// Wraps async handlers so rejected promises reach the error middleware (Express 4).
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  wrap(async (req, res) => {
    const items = await service.listProducts({
      category: req.query.category,
      lowStockOnly: req.query.lowStockOnly === 'true',
    });
    res.json({ count: items.length, items });
  })
);

router.post(
  '/',
  validate(createProductSchema),
  wrap(async (req, res) => {
    res.status(201).json(await service.createProduct(req.body));
  })
);

router.get(
  '/:id',
  validate(skuParamSchema, 'params'),
  wrap(async (req, res) => {
    res.json(await service.getProduct(req.params.id));
  })
);

router.put(
  '/:id',
  validate(skuParamSchema, 'params'),
  validate(updateProductSchema),
  wrap(async (req, res) => {
    res.json(await service.updateProduct(req.params.id, req.body));
  })
);

router.delete(
  '/:id',
  validate(skuParamSchema, 'params'),
  wrap(async (req, res) => {
    await service.deleteProduct(req.params.id);
    res.status(204).end();
  })
);

// POST /api/products/:id/stock  body: { "operation": "reduce", "amount": 5 }
router.post(
  '/:id/stock',
  validate(skuParamSchema, 'params'),
  validate(stockSchema),
  wrap(async (req, res) => {
    res.json(await service.adjustStock(req.params.id, req.body));
  })
);

module.exports = router;
