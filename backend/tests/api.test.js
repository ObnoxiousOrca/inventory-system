'use strict';

// HTTP-level tests: routing, validation and error mapping. The service layer is mocked.
jest.mock('../src/services/inventoryService');

const request = require('supertest');
const service = require('../src/services/inventoryService');
const { AppError } = require('../src/utils/AppError');
const app = require('../src/app');

beforeEach(() => jest.resetAllMocks());

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('POST /api/products rejects invalid input with 400', async () => {
  const res = await request(app).post('/api/products').send({ productId: 'bad sku!', name: '' });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(service.createProduct).not.toHaveBeenCalled();
});

test('POST /api/products creates a product (201)', async () => {
  const body = {
    productId: 'SKU-1',
    name: 'Widget',
    category: 'Parts',
    quantity: 10,
    lowStockThreshold: 3,
    price: 5,
  };
  service.createProduct.mockResolvedValue({ ...body, isLowStock: false });
  const res = await request(app).post('/api/products').send(body);
  expect(res.status).toBe(201);
  expect(service.createProduct).toHaveBeenCalledWith(expect.objectContaining({ productId: 'SKU-1' }));
});

test('POST /api/products/:id/stock maps insufficient stock to 409', async () => {
  service.adjustStock.mockRejectedValue(new AppError(409, 'Insufficient stock', 'INSUFFICIENT_STOCK'));
  const res = await request(app).post('/api/products/SKU-1/stock').send({ operation: 'reduce', amount: 99 });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
});

test('stock endpoint validates operation and amount', async () => {
  const res = await request(app).post('/api/products/SKU-1/stock').send({ operation: 'steal', amount: -1 });
  expect(res.status).toBe(400);
});

test('GET unknown product returns 404', async () => {
  service.getProduct.mockRejectedValue(new AppError(404, 'Product not found', 'NOT_FOUND'));
  const res = await request(app).get('/api/products/NOPE');
  expect(res.status).toBe(404);
});

test('DELETE returns 204', async () => {
  service.deleteProduct.mockResolvedValue();
  const res = await request(app).delete('/api/products/SKU-1');
  expect(res.status).toBe(204);
});

test('unknown route returns JSON 404', async () => {
  const res = await request(app).get('/nope');
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
});
