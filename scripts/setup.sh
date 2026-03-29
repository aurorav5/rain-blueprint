#!/usr/bin/env bash
set -euo pipefail

echo "=== RAIN Development Setup ==="

# Check prerequisites
command -v docker >/dev/null || { echo "Docker required"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ required"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3.12+ required"; exit 1; }
command -v cmake >/dev/null || { echo "CMake required for RainDSP"; exit 1; }

# Copy env template
[ -f .env ] || cp .env.example .env

# Generate JWT keys
mkdir -p /etc/rain
if [ ! -f /etc/rain/jwt.key ]; then
  openssl genrsa -out /etc/rain/jwt.key 4096
  openssl rsa -in /etc/rain/jwt.key -pubout -out /etc/rain/jwt.pub
  echo "JWT keys generated at /etc/rain/"
fi

# Generate watermark + cert keys
[ -f /etc/rain/wm.key ] || openssl rand -hex 32 > /etc/rain/wm.key
[ -f /etc/rain/cert.key ] || openssl genpkey -algorithm Ed25519 -out /etc/rain/cert.key

# Frontend deps
cd frontend && npm ci && cd ..

# Backend deps (for local dev without Docker)
cd backend && pip install -r requirements.txt && cd ..

# Start services
docker-compose up -d postgres redis minio

# Wait for postgres
echo "Waiting for postgres..."
until docker-compose exec postgres pg_isready -U rain_app -d rain 2>/dev/null; do
  sleep 1
done

# Run migrations
cd backend && alembic upgrade head && cd ..

echo "=== Setup complete. Run 'docker-compose up' to start all services ==="
