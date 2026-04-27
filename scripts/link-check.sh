#!/bin/bash
set -e

echo "Running lychee link check on dist folder..."
lychee docs/.vitepress/dist \
    --root-dir docs/.vitepress/dist \
    --include-mail=false \
    --exclude "^file://" \
    --accept '200..=299,403'
