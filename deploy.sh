#!/bin/bash
# Deploy binm8-backend to production server
set -e

SERVER="root@213.165.92.224"
APP_DIR="/var/www/binm8-backend"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Syncing code to server (excluding node_modules, .env, .git)..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude '.dockerignore' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "Installing dependencies and restarting PM2..."
ssh "$SERVER" "cd $APP_DIR && npm install --omit=dev --legacy-peer-deps && pm2 restart binm8-backend"

echo "Deploy complete. Checking status..."
ssh "$SERVER" "pm2 status binm8-backend"
