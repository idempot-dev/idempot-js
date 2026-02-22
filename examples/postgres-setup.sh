#!/bin/bash

set -e

echo "Starting PostgreSQL container..."
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=idempotency \
  -p 5432:5432 \
  docker.io/postgres:latest

echo "Waiting for PostgreSQL to be ready..."
until docker exec postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done

echo ""
echo "PostgreSQL is ready!"
echo "Connection string: postgres://postgres:postgres@localhost:5432/idempotency"
echo ""
echo "To run the example:"
echo "  DATABASE_URL=postgres://postgres:postgres@localhost:5432/idempotency npm run example:postgres"
echo ""
echo "To stop and remove the container:"
echo "  docker stop postgres && docker rm postgres"
