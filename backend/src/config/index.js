'use strict';

// Centralised configuration. Every other module reads settings from here,
// never directly from process.env, so behaviour is easy to find and test.
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  aws: {
    // PLACEHOLDER: change the default region if you deploy somewhere else.
    region: process.env.AWS_REGION || 'ap-south-1',
  },

  dynamo: {
    tableName: process.env.DYNAMODB_TABLE || 'inventory-products',
    // Only set for DynamoDB Local; undefined means "use real AWS".
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  },

  sns: {
    // PLACEHOLDER: set SNS_TOPIC_ARN to the topic created by Terraform.
    // When empty, alerts are logged instead of published.
    topicArn: process.env.SNS_TOPIC_ARN || '',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
};

module.exports = config;
