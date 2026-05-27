#!/bin/bash
# Setup script for Asisten AI Trading System on VPS (Ubuntu 24.04)
# Run: bash setup-vps.sh

set -e

echo "=== Asisten AI Trading System - VPS Setup ==="

# 1. Install Node.js 20+ jika belum
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 2. Install Docker + Docker Compose (untuk Timescale + Redis)
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  echo "RESTART REQUIRED: logout/login atau 'newgrp docker'"
fi

# 3. Install PostgreSQL client (optional, untuk debugging)
if ! command -v psql &> /dev/null; then
  sudo apt-get install -y postgresql-client
fi

# 4. Install PM2 (process manager)
sudo npm install -g pm2

# 5. Clone/pull project (asumsi sudah di folder ini)
echo "Pull latest code..."
git pull origin master || git clone https://github.com/fatkquladhim/asisten.git

# 6. Install dependencies
echo "Installing npm dependencies..."
npm install

# 7. Create .env dari .env.example
if [ ! -f .env ]; then
  echo "Creating .env file..."
  cp .env.example .env
  echo "EDIT .env with your SUMOPOD_API_KEY and TELEGRAM_BOT_TOKEN"
else
  echo ".env already exists"
fi

# 8. Start infra
echo "Starting Docker infra (Timescale + Redis)..."
docker compose up -d

# 9. Wait for DB ready
sleep 5
echo "Checking DB..."
docker exec -it asisten-db pg_isready -U asisten || echo "DB not ready yet"

# 10. Push schema
echo "Pushing DB schema..."
npm run db:push || echo "DB push failed (maybe already exists)"

# 11. PM2 start
echo "Starting app with PM2..."
pm2 start npm --name asisten -- run start || pm2 restart asisten

echo "=== Setup complete! ==="
echo "Commands:"
echo "- pm2 logs asisten         # view logs"
echo "- pm2 restart asisten      # restart app"
echo "- docker compose logs -f   # view infra logs"