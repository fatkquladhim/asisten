#!/bin/bash
# Setup script for Asisten AI Trading System on VPS (Ubuntu 24.04)

set -e

echo "=== Asisten AI Trading System - VPS Setup ==="

# 1. Install Node.js 20+ jika belum
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "RESTART REQUIRED: logout/login atau 'newgrp docker'"
fi

# 2. Install Docker
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
fi

# 3. Install PostgreSQL client
if ! command -v psql &> /dev/null; then
  sudo apt-get install -y postgresql-client
fi

# 4. Install PM2
sudo npm install -g pm2

# 5. Pull project
echo "Pull latest code..."
git pull origin master || git clone https://github.com/fatkquladhim/asisten.git

# 6. Install dependencies
echo "Installing npm dependencies..."
npm install

# 7. Create .env
if [ ! -f .env ]; then
  echo "Creating .env..."
  cp .env.example .env
  echo "EDIT .env with SUMOPOD_API_KEY dan TELEGRAM_BOT_TOKEN"
else
  echo ".env exists"
fi

# 8. Start infra
echo "Starting Docker infra..."
docker compose up -d

# 9. Wait & push schema
sleep 10
echo "Pushing DB schema..."
npm run db:push || echo "Schema may already exist"
echo "Seeding paper account..."
npx tsx src/scripts/seed-account.ts || echo "Seed may already exist"

# 10. PM2 start
pm2 start npm --name asisten -- run start || pm2 restart asisten

echo "=== Done! ==="
echo "Logs: pm2 logs asisten"
echo "Health: curl http://localhost:3000/health"