#!/bin/bash
set -e

CONTAINER_NAME="idempot-js-dev"
REDIS_CONTAINER="${CONTAINER_NAME}-redis"
POSTGRES_CONTAINER="${CONTAINER_NAME}-postgres"

command -v container >/dev/null 2>&1 || { echo "Error: apple/container not installed. See https://github.com/apple/container"; exit 1; }

start() {
    # Check if containers already exist and remove them
    if container inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
        echo "Removing existing Redis container..."
        container stop "$REDIS_CONTAINER" 2>/dev/null || true
        container delete "$REDIS_CONTAINER" 2>/dev/null || true
    fi
    
    if container inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
        echo "Removing existing Postgres container..."
        container stop "$POSTGRES_CONTAINER" 2>/dev/null || true
        container delete "$POSTGRES_CONTAINER" 2>/dev/null || true
    fi

    echo "Starting Redis..."
    container run -d \
        --name "$REDIS_CONTAINER" \
        -p 6379:6379 \
        arm64v8/redis:7-alpine \
        redis-server --appendonly yes

    echo "Starting Postgres..."
    container run -d \
        --name "$POSTGRES_CONTAINER" \
        -p 5432:5432 \
        -e POSTGRES_USER=idempot \
        -e POSTGRES_PASSWORD=idempot \
        -e POSTGRES_DB=test \
        postgres:16-alpine

    # Wait for Redis using host port
    echo "Waiting for Redis on port 6379..."
    for i in {1..30}; do
        if nc -z 127.0.0.1 6379 2>/dev/null; then
            echo "Redis is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "ERROR: Redis failed to start"
            container logs "$REDIS_CONTAINER"
            exit 1
        fi
        sleep 1
    done

    # Wait for Postgres using host port
    echo "Waiting for Postgres on port 5432..."
    for i in {1..30}; do
        if nc -z 127.0.0.1 5432 2>/dev/null; then
            echo "Postgres is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "ERROR: Postgres failed to start"
            container logs "$POSTGRES_CONTAINER"
            exit 1
        fi
        sleep 1
    done

    echo "$CONTAINER_NAME is running (Redis on 6379, Postgres on 5432)"
}

stop() {
    echo "Stopping $CONTAINER_NAME..."
    container stop "$REDIS_CONTAINER" 2>/dev/null || true
    container stop "$POSTGRES_CONTAINER" 2>/dev/null || true
    container delete "$REDIS_CONTAINER" 2>/dev/null || true
    container delete "$POSTGRES_CONTAINER" 2>/dev/null || true
    echo "$CONTAINER_NAME is stopped"
}

status() {
    echo "Container status:"
    container inspect "$REDIS_CONTAINER" 2>/dev/null && echo "Redis: running" || echo "Redis: not running"
    container inspect "$POSTGRES_CONTAINER" 2>/dev/null && echo "Postgres: running" || echo "Postgres: not running"
}

logs() {
    echo "=== Redis logs ==="
    container logs "$REDIS_CONTAINER" 2>/dev/null || echo "Redis container not found"
    echo ""
    echo "=== Postgres logs ==="
    container logs "$POSTGRES_CONTAINER" 2>/dev/null || echo "Postgres container not found"
}

restart() {
    stop
    start
}

case "$1" in
    start) start ;;
    stop) stop ;;
    status) status ;;
    logs) logs ;;
    restart) restart ;;
    *) echo "Usage: $0 {start|stop|status|logs|restart}" ;;
esac
