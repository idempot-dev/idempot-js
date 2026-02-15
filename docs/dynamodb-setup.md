# DynamoDB Setup Guide

This guide explains how to set up DynamoDB as the storage backend for the hono-idempotency middleware.

## Prerequisites

- AWS Account with DynamoDB access
- AWS credentials configured locally or in your application environment
- Node.js and npm installed

## Installation

```bash
npm install hono-idempotency @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Table Schema

The idempotency records table requires the following schema:

### Primary Index

- **Partition Key**: `key` (String)
- **Sort Key**: None

### Global Secondary Index

- **Index Name**: `fingerprint-index`
- **Partition Key**: `fingerprint` (String)
- **Projection**: `ALL` or at minimum the fields listed below

### Required Attributes

- `key` - String, Idempotency key (Partition Key)
- `fingerprint` - String, Request fingerprint (for duplicate detection)
- `status` - String, Current status (processing/completed)
- `expiresAt` - Number, Unix timestamp in seconds (for TTL)
- `responseStatus` - Number, HTTP response status (optional, only when completed)
- `responseHeaders` - Map/Record, HTTP response headers (optional, only when completed)
- `responseBody` - String, HTTP response body (optional, only when completed)

## Setup Methods

### Method 1: CloudFormation

Create a file `cloudformation-template.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "DynamoDB table for idempotency records"

Parameters:
  TableName:
    Type: String
    Default: idempotency-records
    Description: Name of the DynamoDB table

Resources:
  IdempotencyRecordsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Ref TableName
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: key
          AttributeType: S
        - AttributeName: fingerprint
          AttributeType: S
      KeySchema:
        - AttributeName: key
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: fingerprint-index
          KeySchema:
            - AttributeName: fingerprint
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        AttributeName: expiresAt
        Enabled: true

Outputs:
  TableName:
    Value: !Ref IdempotencyRecordsTable
    Description: Name of the idempotency records table
  TableArn:
    Value: !GetAtt IdempotencyRecordsTable.Arn
    Description: ARN of the idempotency records table
```

Deploy with:

```bash
aws cloudformation create-stack \
  --stack-name idempotency-stack \
  --template-body file://cloudformation-template.yaml
```

### Method 2: Terraform

Create a file `terraform/main.tf`:

```hcl
provider "aws" {
  region = var.aws_region
}

resource "aws_dynamodb_table" "idempotency_records" {
  name           = var.table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "key"

  attribute {
    name = "key"
    type = "S"
  }

  attribute {
    name = "fingerprint"
    type = "S"
  }

  global_secondary_index {
    name            = "fingerprint-index"
    hash_key        = "fingerprint"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

variable "aws_region" {
  default = "us-east-1"
}

variable "table_name" {
  default = "idempotency-records"
}

variable "environment" {
  default = "development"
}

output "table_name" {
  value = aws_dynamodb_table.idempotency_records.name
}

output "table_arn" {
  value = aws_dynamodb_table.idempotency_records.arn
}
```

Deploy with:

```bash
terraform init
terraform apply
```

### Method 3: AWS CDK

Create a file `cdk/stack.ts`:

```typescript
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cdk from "aws-cdk-lib";

export class IdempotencyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "IdempotencyRecords", {
      tableName: "idempotency-records",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "key",
        type: dynamodb.AttributeType.STRING
      },
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY
    });

    table.addGlobalSecondaryIndex({
      indexName: "fingerprint-index",
      partitionKey: {
        name: "fingerprint",
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    new cdk.CfnOutput(this, "TableName", {
      value: table.tableName
    });
  }
}
```

Deploy with:

```bash
cdk deploy
```

### Method 4: AWS CLI

```bash
# Create the table
aws dynamodb create-table \
  --table-name idempotency-records \
  --attribute-definitions \
    AttributeName=key,AttributeType=S \
    AttributeName=fingerprint,AttributeType=S \
  --key-schema AttributeName=key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    'IndexName=fingerprint-index,KeySchema=[{AttributeName=fingerprint,KeyType=HASH}],Projection={ProjectionType=ALL}' \
  --region us-east-1

# Enable TTL
aws dynamodb update-time-to-live \
  --table-name idempotency-records \
  --time-to-live-specification AttributeName=expiresAt,Enabled=true \
  --region us-east-1
```

## Usage

### Basic Setup

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});

const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records" // Default if omitted
});

const app = new Hono();

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler
  return c.json({ id: "order-123" }, 201);
});
```

### With Local DynamoDB (for development)

For local testing, use DynamoDB Local:

```bash
# Start DynamoDB Local (requires Docker)
docker run -d -p 8000:8000 amazon/dynamodb-local

# Create table using AWS CLI with local endpoint
aws dynamodb create-table \
  --table-name idempotency-records \
  --attribute-definitions \
    AttributeName=key,AttributeType=S \
    AttributeName=fingerprint,AttributeType=S \
  --key-schema AttributeName=key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    'IndexName=fingerprint-index,KeySchema=[{AttributeName=fingerprint,KeyType=HASH}],Projection={ProjectionType=ALL}' \
  --endpoint-url http://localhost:8000 \
  --region us-east-1
```

Then configure your client:

```typescript
const dynamoDBClient = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000"
});
```

### Environment Variables

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

# For local DynamoDB
export DYNAMODB_ENDPOINT=http://localhost:8000
export IDEMPOTENCY_TABLE=idempotency-records
```

## Features

### Automatic TTL Cleanup

The store uses DynamoDB's Time To Live (TTL) feature to automatically expire old records:

- Records set to expire based on the `expiresAt` attribute
- Expired records are automatically removed within 24 hours
- No manual cleanup required

### Concurrent Request Detection

The middleware prevents processing the same request multiple times:

- Returns `409 Conflict` if another request with the same key is currently processing
- Returns the cached response if the request has already been processed

### Duplicate Request Detection

The fingerprinting system detects when the same logical request is sent with different keys:

- Returns `409 Conflict` with a different key
- Allows the same key with identical payloads

### IAM Permissions

Required IAM permissions for the DynamoDB store:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/idempotency-records",
        "arn:aws:dynamodb:*:*:table/idempotency-records/index/*"
      ]
    }
  ]
}
```

## Troubleshooting

### Table Not Found

Ensure the table exists and the table name matches exactly (case-sensitive):

```bash
aws dynamodb describe-table --table-name idempotency-records
```

### Permission Denied

Verify your AWS credentials have the required DynamoDB permissions:

```bash
aws dynamodb list-tables
```

### Connection Timeout

Check that:

- AWS credentials are properly configured
- The AWS region is correct
- For local DynamoDB, the endpoint is reachable
- Network security groups allow outbound HTTPS

### High Latency

DynamoDB on-demand billing is suitable for most workloads. For very high traffic:

- Consider provisioned capacity instead of on-demand
- Use DAX (DynamoDB Accelerator) for caching
- Implement batch operations

## Performance Considerations

- **On-Demand Billing**: Automatically scales, no capacity planning required
- **Storage**: ~1-2 KB per record with typical HTTP headers and bodies
- **Query Performance**: < 10ms average with proper indexing
- **TTL**: Records expire within 48 hours of the expiration time

## Next Steps

See the [examples](../examples/dynamodb-app.ts) directory for complete usage examples.
