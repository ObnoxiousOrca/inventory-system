'use strict';

const {
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../db/dynamo');
const config = require('../config');
const { AppError } = require('../utils/AppError');

const TableName = config.dynamo.tableName;
const isConditionFailure = (err) => err && err.name === 'ConditionalCheckFailedException';

// Table design: partition key `productId` (the SKU). A Scan is used for list/dashboard,
// which is fine at lab scale; for large data add a GSI on `category`.

async function create(product) {
  try {
    await docClient.send(
      new PutCommand({
        TableName,
        Item: product,
        ConditionExpression: 'attribute_not_exists(productId)',
      })
    );
    return product;
  } catch (err) {
    if (isConditionFailure(err)) {
      throw new AppError(409, `Product with SKU '${product.productId}' already exists`, 'DUPLICATE_SKU');
    }
    throw err;
  }
}

async function getById(productId) {
  const res = await docClient.send(new GetCommand({ TableName, Key: { productId } }));
  return res.Item || null;
}

async function list() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Updates only the provided descriptive fields (name, category, price, ...).
async function update(productId, fields) {
  const names = {};
  const values = { ':updatedAt': new Date().toISOString() };
  const sets = ['#updatedAt = :updatedAt'];
  names['#updatedAt'] = 'updatedAt';

  Object.entries(fields).forEach(([key, value], i) => {
    names[`#f${i}`] = key;
    values[`:v${i}`] = value;
    sets.push(`#f${i} = :v${i}`);
  });

  try {
    const res = await docClient.send(
      new UpdateCommand({
        TableName,
        Key: { productId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: 'attribute_exists(productId)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return res.Attributes;
  } catch (err) {
    if (isConditionFailure(err)) throw new AppError(404, 'Product not found', 'NOT_FOUND');
    throw err;
  }
}

async function remove(productId) {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName,
        Key: { productId },
        ConditionExpression: 'attribute_exists(productId)',
      })
    );
  } catch (err) {
    if (isConditionFailure(err)) throw new AppError(404, 'Product not found', 'NOT_FOUND');
    throw err;
  }
}

// Atomic stock change. `delta` is positive (increase) or negative (reduce).
// A reduce is rejected by DynamoDB itself if it would take stock below zero,
// so concurrent requests can never oversell.
async function adjustQuantity(productId, delta) {
  const values = { ':delta': delta, ':updatedAt': new Date().toISOString() };
  let condition = 'attribute_exists(productId)';
  if (delta < 0) {
    condition += ' AND quantity >= :minQty';
    values[':minQty'] = -delta;
  }
  try {
    const res = await docClient.send(
      new UpdateCommand({
        TableName,
        Key: { productId },
        UpdateExpression: 'SET quantity = quantity + :delta, updatedAt = :updatedAt',
        ConditionExpression: condition,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return res.Attributes;
  } catch (err) {
    if (isConditionFailure(err)) {
      // Distinguish "missing" from "not enough stock".
      const existing = await getById(productId);
      if (!existing) throw new AppError(404, 'Product not found', 'NOT_FOUND');
      throw new AppError(409, `Insufficient stock: only ${existing.quantity} available`, 'INSUFFICIENT_STOCK');
    }
    throw err;
  }
}

// Atomically flips lowStockAlertSent false -> true.
// Returns true only for the single caller that wins, which prevents duplicate emails.
async function markAlertSent(productId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName,
        Key: { productId },
        UpdateExpression: 'SET lowStockAlertSent = :t',
        ConditionExpression: 'attribute_exists(productId) AND lowStockAlertSent = :f',
        ExpressionAttributeValues: { ':t': true, ':f': false },
      })
    );
    return true;
  } catch (err) {
    if (isConditionFailure(err)) return false;
    throw err;
  }
}

// Clears the flag (product restocked above threshold, or alert publishing failed).
async function resetAlertFlag(productId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName,
        Key: { productId },
        UpdateExpression: 'SET lowStockAlertSent = :f',
        ConditionExpression: 'attribute_exists(productId)',
        ExpressionAttributeValues: { ':f': false },
      })
    );
  } catch (err) {
    if (!isConditionFailure(err)) throw err;
  }
}

module.exports = {
  create,
  getById,
  list,
  update,
  remove,
  adjustQuantity,
  markAlertSent,
  resetAlertFlag,
};
