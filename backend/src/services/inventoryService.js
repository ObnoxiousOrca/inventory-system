'use strict';

const repo = require('../repositories/productRepository');
const notifier = require('./notificationService');
const logger = require('../config/logger');
const { AppError } = require('../utils/AppError');

const withLowStockFlag = (p) => ({ ...p, isLowStock: p.quantity <= p.lowStockThreshold });

/**
 * Low-stock rule from the synopsis: quantity <= threshold => Low Stock.
 *
 * De-duplication: `lowStockAlertSent` is flipped false -> true with a conditional write,
 * so only one request wins and sends the email. The flag is cleared once the product is
 * restocked above the threshold, so the next drop triggers a fresh alert.
 */
async function evaluateAlert(product) {
  const isLow = product.quantity <= product.lowStockThreshold;

  if (isLow && !product.lowStockAlertSent) {
    // If SNS isn't configured, don't consume the flag - just log.
    if (!notifier.isEnabled()) {
      await notifier.publishLowStockAlert(product);
      return product;
    }
    const won = await repo.markAlertSent(product.productId);
    if (won) {
      try {
        await notifier.publishLowStockAlert(product);
        return { ...product, lowStockAlertSent: true };
      } catch (err) {
        // Publishing failed: clear the flag so a later update can retry. Never fail the stock update itself.
        logger.error({ err, sku: product.productId }, 'failed to publish low-stock alert');
        await repo.resetAlertFlag(product.productId);
      }
    }
  } else if (!isLow && product.lowStockAlertSent) {
    await repo.resetAlertFlag(product.productId);
    return { ...product, lowStockAlertSent: false };
  }
  return product;
}

async function createProduct(input) {
  const now = new Date().toISOString();
  const product = {
    productId: input.productId,
    name: input.name,
    category: input.category,
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    price: input.price,
    description: input.description || '',
    lowStockAlertSent: false,
    createdAt: now,
    updatedAt: now,
  };
  await repo.create(product);
  const result = await evaluateAlert(product); // a product created already low should alert too
  return withLowStockFlag(result);
}

async function getProduct(productId) {
  const product = await repo.getById(productId);
  if (!product) throw new AppError(404, 'Product not found', 'NOT_FOUND');
  return withLowStockFlag(product);
}

async function listProducts({ category, lowStockOnly } = {}) {
  let items = (await repo.list()).map(withLowStockFlag);
  if (category) items = items.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  if (lowStockOnly) items = items.filter((p) => p.isLowStock);
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function updateProduct(productId, fields) {
  const updated = await repo.update(productId, fields);
  // The threshold may have changed, so re-check.
  return withLowStockFlag(await evaluateAlert(updated));
}

async function deleteProduct(productId) {
  await repo.remove(productId);
}

// operation: 'increase' | 'reduce'; amount: positive integer.
async function adjustStock(productId, { operation, amount }) {
  const delta = operation === 'reduce' ? -amount : amount;
  const updated = await repo.adjustQuantity(productId, delta);
  return withLowStockFlag(await evaluateAlert(updated));
}

async function getDashboard() {
  const products = (await repo.list()).map(withLowStockFlag);
  const byCategory = {};
  products.forEach((p) => {
    byCategory[p.category] = (byCategory[p.category] || 0) + p.quantity;
  });
  return {
    totalProducts: products.length,
    totalQuantity: products.reduce((sum, p) => sum + p.quantity, 0),
    lowStockCount: products.filter((p) => p.isLowStock).length,
    // Feeds the bar chart "stock levels by category" in the frontend.
    stockByCategory: Object.entries(byCategory).map(([category, quantity]) => ({ category, quantity })),
    recentlyUpdated: [...products]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5),
  };
}

module.exports = {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  adjustStock,
  getDashboard,
  evaluateAlert,
};
