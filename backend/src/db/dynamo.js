'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const config = require('../config');

// Credentials are NOT set here. In AWS the SDK picks them up from the ECS task role;
// locally it reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the environment.
const baseClient = new DynamoDBClient({
  region: config.aws.region,
  ...(config.dynamo.endpoint ? { endpoint: config.dynamo.endpoint } : {}),
});

const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

module.exports = { baseClient, docClient };
