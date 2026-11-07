'use strict';

const { z } = require('zod');

const sku = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, digits, dot, underscore, hyphen');

const createProductSchema = z.object({
  productId: sku,
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  quantity: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0),
  price: z.number().min(0),
  description: z.string().trim().max(500).optional(),
});

// All fields optional on update; quantity changes go through the /stock endpoint.
const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    lowStockThreshold: z.number().int().min(0),
    price: z.number().min(0),
    description: z.string().trim().max(500),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

const stockSchema = z.object({
  operation: z.enum(['increase', 'reduce']),
  amount: z.number().int().positive().max(1_000_000),
});

const listQuerySchema = z.object({
  category: z.string().trim().max(60).optional(),
  lowStockOnly: z.enum(['true', 'false']).optional(),
});

const skuParamSchema = z.object({ id: sku });

module.exports = {
  createProductSchema,
  updateProductSchema,
  stockSchema,
  listQuerySchema,
  skuParamSchema,
};
