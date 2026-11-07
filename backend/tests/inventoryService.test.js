'use strict';

// Unit tests for the low-stock alert logic. The repository and SNS notifier are mocked,
// so these tests need no AWS access and no network.
jest.mock('../src/repositories/productRepository');
jest.mock('../src/services/notificationService');

const repo = require('../src/repositories/productRepository');
const notifier = require('../src/services/notificationService');
const service = require('../src/services/inventoryService');

const base = {
  productId: 'SKU-1',
  name: 'Widget',
  category: 'Parts',
  quantity: 10,
  lowStockThreshold: 5,
  price: 9.5,
  lowStockAlertSent: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
  notifier.isEnabled.mockReturnValue(true);
  notifier.publishLowStockAlert.mockResolvedValue(true);
});

describe('adjustStock alerts', () => {
  test('reducing to the threshold sends exactly one alert', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 5 });
    repo.markAlertSent.mockResolvedValue(true);

    const result = await service.adjustStock('SKU-1', { operation: 'reduce', amount: 5 });

    expect(repo.adjustQuantity).toHaveBeenCalledWith('SKU-1', -5);
    expect(notifier.publishLowStockAlert).toHaveBeenCalledTimes(1);
    expect(result.isLowStock).toBe(true);
  });

  test('no alert when stock stays above the threshold', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 8 });
    await service.adjustStock('SKU-1', { operation: 'reduce', amount: 2 });
    expect(notifier.publishLowStockAlert).not.toHaveBeenCalled();
  });

  test('no repeat alert when one was already sent', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 2, lowStockAlertSent: true });
    await service.adjustStock('SKU-1', { operation: 'reduce', amount: 1 });
    expect(notifier.publishLowStockAlert).not.toHaveBeenCalled();
  });

  test('losing the atomic flag race sends nothing', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 3 });
    repo.markAlertSent.mockResolvedValue(false);
    await service.adjustStock('SKU-1', { operation: 'reduce', amount: 1 });
    expect(notifier.publishLowStockAlert).not.toHaveBeenCalled();
  });

  test('restocking above the threshold resets the flag', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 20, lowStockAlertSent: true });
    const result = await service.adjustStock('SKU-1', { operation: 'increase', amount: 18 });
    expect(repo.resetAlertFlag).toHaveBeenCalledWith('SKU-1');
    expect(result.isLowStock).toBe(false);
  });

  test('SNS failure resets the flag but does not fail the update', async () => {
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 1 });
    repo.markAlertSent.mockResolvedValue(true);
    notifier.publishLowStockAlert.mockRejectedValue(new Error('sns down'));

    await expect(service.adjustStock('SKU-1', { operation: 'reduce', amount: 9 })).resolves.toBeDefined();
    expect(repo.resetAlertFlag).toHaveBeenCalledWith('SKU-1');
  });

  test('SNS not configured: logs only and keeps the flag untouched', async () => {
    notifier.isEnabled.mockReturnValue(false);
    repo.adjustQuantity.mockResolvedValue({ ...base, quantity: 1 });
    await service.adjustStock('SKU-1', { operation: 'reduce', amount: 9 });
    expect(repo.markAlertSent).not.toHaveBeenCalled();
  });
});

describe('dashboard', () => {
  test('aggregates totals, low-stock count and category quantities', async () => {
    repo.list.mockResolvedValue([
      { ...base, productId: 'A', quantity: 2, category: 'X' },
      { ...base, productId: 'B', quantity: 30, category: 'X' },
      { ...base, productId: 'C', quantity: 7, category: 'Y' },
    ]);
    const d = await service.getDashboard();
    expect(d.totalProducts).toBe(3);
    expect(d.totalQuantity).toBe(39);
    expect(d.lowStockCount).toBe(1);
    expect(d.stockByCategory).toEqual(
      expect.arrayContaining([
        { category: 'X', quantity: 32 },
        { category: 'Y', quantity: 7 },
      ])
    );
  });
});
