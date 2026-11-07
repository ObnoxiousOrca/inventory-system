'use strict';

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const config = require('../config');
const logger = require('../config/logger');

const sns = new SNSClient({ region: config.aws.region });

// True when an SNS topic is configured. When false, alerts are only logged.
function isEnabled() {
  return Boolean(config.sns.topicArn);
}

// Publishes a low-stock alert. The SNS topic must have an email subscription
// (created by Terraform; the recipient must click the confirmation link once).
async function publishLowStockAlert(product) {
  const subject = `Low stock: ${product.name} (${product.productId})`.slice(0, 100); // SNS subject max 100 chars
  const message = [
    'Low stock alert',
    '',
    `Product:   ${product.name}`,
    `SKU:       ${product.productId}`,
    `Category:  ${product.category}`,
    `Quantity:  ${product.quantity}`,
    `Threshold: ${product.lowStockThreshold}`,
    '',
    'Please restock this product.',
  ].join('\n');

  if (!isEnabled()) {
    logger.warn({ sku: product.productId }, 'SNS_TOPIC_ARN not set - low-stock alert logged only');
    logger.info({ subject, message }, 'low-stock alert (not sent)');
    return false;
  }

  await sns.send(
    new PublishCommand({
      TopicArn: config.sns.topicArn,
      Subject: subject,
      Message: message,
    })
  );
  logger.info({ sku: product.productId }, 'low-stock alert published to SNS');
  return true;
}

module.exports = { publishLowStockAlert, isEnabled };
