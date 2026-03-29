#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-staging}
GIT_SHA=$(git rev-parse --short HEAD)

echo "=== Deploying RAIN v6.0.0 (${GIT_SHA}) to ${ENV} ==="

# Safety check: block prod deploy if RAIN_NORMALIZATION_VALIDATED=false
if [[ "${ENV}" == "production" ]]; then
    GATE=$(grep -r "RAIN_NORMALIZATION_VALIDATED" ".env.${ENV}" 2>/dev/null | grep -c "=true" || true)
    if [[ "${GATE}" -eq 0 ]]; then
        echo "ERROR: RAIN_NORMALIZATION_VALIDATED is not 'true' in .env.${ENV}"
        echo "Production deploy blocked. Get ML lead + Phil Bölke sign-off first."
        exit 1
    fi
fi

echo "[1/4] Running launch readiness checks..."
python scripts/launch_check.py "${ENV}"

echo "[2/4] Building Docker images..."
docker build -f docker/Dockerfile.backend.prod -t "rain-backend:${GIT_SHA}" .
docker build -f docker/Dockerfile.worker -t "rain-worker:${GIT_SHA}" .
docker build -f docker/Dockerfile.frontend.prod -t "rain-frontend:${GIT_SHA}" .

echo "[3/4] Running database migrations..."
docker run --rm --env-file ".env.${ENV}" "rain-backend:${GIT_SHA}" \
    alembic upgrade head

echo "[4/4] Deploy complete."
echo "  backend:  rain-backend:${GIT_SHA}"
echo "  worker:   rain-worker:${GIT_SHA}"
echo "  frontend: rain-frontend:${GIT_SHA}"
echo ""
echo "RAIN_NORMALIZATION_VALIDATED: requires ML lead + Phil Bölke sign-off to enable"
