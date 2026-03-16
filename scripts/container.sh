#!/bin/bash
set -e

CONTAINER_NAME="idempot-js-dev"
CONFIG_PATH="$(dirname "$0")/../config/container.yaml"

command -v container >/dev/null 2>&1 || { echo "Error: apple/container not installed. See https://github.com/apple/container"; exit 1; }

start() {
    # Check if container already exists and remove it
    if container info "$CONTAINER_NAME" >/dev/null 2>&1; then
        echo "Removing existing $CONTAINER_NAME..."
        container stop "$CONTAINER_NAME" 2>/dev/null || true
        container delete "$CONTAINER_NAME" 2>/dev/null || true
    fi

    echo "Creating and starting $CONTAINER_NAME..."
    container create --config "$CONFIG_PATH" --name "$CONTAINER_NAME"
    container start "$CONTAINER_NAME"

    # Wait for Redis using host port (faster than exec into container)
    echo "Waiting for Redis on port 6379..."
    for i in {1..30}; do
        if nc -z 127.0.0.1 6379 2>/dev/null; then
            echo "Redis is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "ERROR: Redis failed to start"
            container logs "$CONTAINER_NAME"
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
            container logs "$CONTAINER_NAME"
            exit 1
        fi
        sleep 1
    done

    echo "$CONTAINER_NAME is running"
}

stop() {
    echo "Stopping $CONTAINER_NAME..."
    container stop "$CONTAINER_NAME" 2>/dev/null || true
    container delete "$CONTAINER_NAME" 2>/dev/null || true
    echo "$CONTAINER_NAME is stopped"
}

status() {
    if container info "$CONTAINER_NAME" >/dev/null 2>&1; then
        echo "$CONTAINER_NAME is running"
        container info "$CONTAINER_NAME"
    else
        echo "$CONTAINER_NAME is not running"
    fi
}

logs() {
    container logs "$CONTAINER_NAME"
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
