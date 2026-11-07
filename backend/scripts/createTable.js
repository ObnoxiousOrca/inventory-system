'use strict';

// Creates the DynamoDB table. Intended for LOCAL development (DynamoDB Local).
// In AWS the table is created by Terraform instead - don't run this against production.
require('dotenv').config();
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { baseClient } = require('../src/db/dynamo');
const config = require('../src/config');

async function main() {
  try {
    await baseClient.send(new DescribeTableCommand({ TableName: config.dynamo.tableName }));
    console.log(`Table '${config.dynamo.tableName}' already exists`);
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
  await baseClient.send(
    new CreateTableCommand({
      TableName: config.dynamo.tableName,
      AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    })
  );
  console.log(`Created table '${config.dynamo.tableName}'`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
