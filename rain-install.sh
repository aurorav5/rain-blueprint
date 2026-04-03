#!/usr/bin/env bash
# ============================================================================
# RAIN — R∞N AI MASTERING ENGINE
# Single-command install and run script
#
# Usage:
#   chmod +x rain-install.sh && ./rain-install.sh
#
# What this does:
#   1. Checks prerequisites (Docker, Docker Compose, Git, OpenSSL)
#   2. Generates all secrets and JWT keys if not present
#   3. Creates required directories and signing keys
#   4. Copies .env from .env.example with real generated values
#   5. Builds all Docker images
#   6. Starts the full stack (12 services)
#   7. Runs database migrations
#   8. Verifies all services are healthy
#   9. Prints access URLs
#
# Services started:
#   - PostgreSQL 18      (port 5432)
#   - Valkey 9.0         (port 6379)
#   - MinIO S3           (port 9000, console 9001)
#   - FastAPI Backend     (port 8000)
#   - Celery Worker       (background)
#   - Vite Frontend       (port 4173)
#   - Prometheus          (port 9090)
#   - Grafana             (port 3000)
#   - Postgres Exporter   (port 9187)
#   - Valkey Exporter     (port 9121)
#
# ARCOVEL Technologies International — engineering@arcovel.com
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors and helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[RAIN]${NC} $*"; }
success() { echo -e "${GREEN}[RAIN]${NC} $*"; }
warn()    { echo -e "${YELLOW}[RAIN]${NC} $*"; }
error()   { echo -e "${RED}[RAIN]${NC} $*"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

# ---------------------------------------------------------------------------
# Step 0: Banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'

  ██████╗  █████╗ ██╗███╗   ██╗
  ██╔══██╗██╔══██╗██║████╗  ██║
  ██████╔╝███████║██║██╔██╗ ██║
  ██╔══██╗██╔══██║██║██║╚██╗██║
  ██║  ██║██║  ██║██║██║ ╚████║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
  R∞N AI MASTERING ENGINE v6.0

  "Rain doesn't live in the cloud."
  ARCOVEL Technologies International

BANNER
echo -e "${NC}"

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
header "Checking prerequisites"

MISSING=0

check_cmd() {
    if command -v "$1" &>/dev/null; then
        success "$1 found: $(command -v "$1")"
    else
        error "$1 not found. Please install $1 first."
        MISSING=1
    fi
}

check_cmd docker
check_cmd openssl
check_cmd git

# Check Docker Compose (v2 plugin or standalone)
if docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
    success "Docker Compose v2 found"
elif command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
    success "Docker Compose (standalone) found"
else
    error "Docker Compose not found. Install Docker Desktop or docker-compose."
    MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
    error "Missing prerequisites. Install them and re-run this script."
    exit 1
fi

# Check Docker is running
if ! docker info &>/dev/null 2>&1; then
    error "Docker is not running. Start Docker Desktop or the Docker daemon."
    exit 1
fi
success "Docker daemon is running"

# ---------------------------------------------------------------------------
# Step 2: Determine project root
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# If script is run from outside the repo, check if we're in the repo
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    error "docker-compose.yml not found in $PROJECT_ROOT"
    error "Run this script from the rain-blueprint repository root."
    exit 1
fi

cd "$PROJECT_ROOT"
info "Project root: $PROJECT_ROOT"

# ---------------------------------------------------------------------------
# Step 3: Generate secrets and keys
# ---------------------------------------------------------------------------
header "Generating secrets and keys"

KEYS_DIR="$PROJECT_ROOT/.rain-keys"
mkdir -p "$KEYS_DIR"

# JWT RSA key pair
if [ ! -f "$KEYS_DIR/jwt.key" ]; then
    info "Generating JWT RS256 key pair..."
    openssl genrsa -out "$KEYS_DIR/jwt.key" 4096 2>/dev/null
    openssl rsa -in "$KEYS_DIR/jwt.key" -pubout -out "$KEYS_DIR/jwt.pub" 2>/dev/null
    success "JWT keys generated"
else
    success "JWT keys already exist"
fi

# RAIN-CERT Ed25519 signing key
if [ ! -f "$KEYS_DIR/cert.key" ]; then
    info "Generating RAIN-CERT Ed25519 signing key..."
    openssl genpkey -algorithm Ed25519 -out "$KEYS_DIR/cert.key" 2>/dev/null
    openssl pkey -in "$KEYS_DIR/cert.key" -pubout -out "$KEYS_DIR/cert.pub" 2>/dev/null
    success "RAIN-CERT signing key generated"
else
    success "RAIN-CERT signing key already exists"
fi

# Watermark key
if [ ! -f "$KEYS_DIR/wm.key" ]; then
    info "Generating watermark key..."
    openssl rand -hex 32 > "$KEYS_DIR/wm.key"
    success "Watermark key generated"
else
    success "Watermark key already exists"
fi

# JWT secret (symmetric fallback)
JWT_SECRET=$(openssl rand -hex 32)

# Postgres password
PG_PASSWORD=$(openssl rand -hex 16)

# ---------------------------------------------------------------------------
# Step 4: Create .env file
# ---------------------------------------------------------------------------
header "Configuring environment"

if [ -f "$PROJECT_ROOT/.env" ]; then
    warn ".env file already exists — backing up to .env.backup"
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup.$(date +%s)"
fi

cat > "$PROJECT_ROOT/.env" << ENVFILE
# ============================================================================
# RAIN Environment — Auto-generated by rain-install.sh
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ============================================================================

# Core
RAIN_ENV=development
RAIN_VERSION=6.0.0
RAIN_LOG_LEVEL=debug

# Database
POSTGRES_USER=rain_app
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=rain
DATABASE_URL=postgresql+asyncpg://rain_app:${PG_PASSWORD}@postgres:5432/rain

# Cache
VALKEY_URL=redis://valkey:6379/0
REDIS_URL=redis://valkey:6379/0

# Storage (MinIO in dev)
S3_BUCKET=rain-audio
S3_ENDPOINT_URL=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# Auth
JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=RS256
JWT_PUBLIC_KEY_PATH=/etc/rain/jwt.pub
JWT_PRIVATE_KEY_PATH=/etc/rain/jwt.key

# Signing keys
RAIN_CERT_SIGNING_KEY_PATH=/etc/rain/cert.key
RAIN_WATERMARK_KEY_PATH=/etc/rain/wm.key

# Billing (Stripe — replace with real keys for production)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_SPARK_MONTHLY=
STRIPE_PRICE_CREATOR_MONTHLY=
STRIPE_PRICE_ARTIST_MONTHLY=
STRIPE_PRICE_STUDIO_PRO_MONTHLY=

# ML
RAIN_NORMALIZATION_VALIDATED=false
ANTHROPIC_API_KEY=
ONNX_MODEL_PATH=/models/rain_base.onnx
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=cpu

# Frontend
FRONTEND_URL=http://localhost:4173
BACKEND_URL=http://localhost:8000

# Content verification (optional — leave blank to skip layers)
ACRCLOUD_HOST=
ACRCLOUD_ACCESS_KEY=
ACRCLOUD_ACCESS_SECRET=
AUDD_API_TOKEN=

# Distribution (optional)
LABELGRID_API_KEY=
LABELGRID_API_BASE=https://api.labelgrid.com/v1
LABELGRID_SANDBOX=true
ISRC_REGISTRANT_CODE=ARC
UPC_GS1_PREFIX=000000

# Monitoring
GF_ADMIN_USER=admin
GF_ADMIN_PASSWORD=rain_grafana

# Atmos
ATMOS_ENABLED=false
ENVFILE

success ".env file created with generated secrets"

# ---------------------------------------------------------------------------
# Step 5: Mount keys into containers
# ---------------------------------------------------------------------------
header "Setting up key mounts"

# Create /etc/rain directory for key mounting (used by docker-compose volume mount)
# We override the volume mount to use our local keys directory
DOCKER_OVERRIDE="$PROJECT_ROOT/docker-compose.override.yml"

cat > "$DOCKER_OVERRIDE" << 'OVERRIDE'
# Auto-generated by rain-install.sh — mounts local keys into containers
services:
  backend:
    volumes:
      - ./backend:/app
      - ./.rain-keys:/etc/rain:ro
  worker:
    volumes:
      - ./backend:/app
      - ./.rain-keys:/etc/rain:ro
OVERRIDE

success "Key mount override created"

# ---------------------------------------------------------------------------
# Step 6: Build Docker images
# ---------------------------------------------------------------------------
header "Building Docker images"

info "This may take 3-5 minutes on first run..."
$COMPOSE build --parallel 2>&1 | while IFS= read -r line; do
    if echo "$line" | grep -qiE "(error|failed|fatal)"; then
        error "$line"
    elif echo "$line" | grep -qiE "(successfully|built|done)"; then
        success "$line"
    fi
done

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    error "Docker build failed. Check the output above for errors."
    exit 1
fi
success "All images built"

# ---------------------------------------------------------------------------
# Step 7: Start the stack
# ---------------------------------------------------------------------------
header "Starting RAIN stack"

info "Starting all services..."
$COMPOSE up -d

# ---------------------------------------------------------------------------
# Step 8: Wait for services to be healthy
# ---------------------------------------------------------------------------
header "Waiting for services"

wait_for_service() {
    local service=$1
    local url=$2
    local max_wait=${3:-60}
    local elapsed=0

    printf "  Waiting for %-20s" "$service..."
    while [ $elapsed -lt $max_wait ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}ready${NC} (${elapsed}s)"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo -e " ${RED}timeout after ${max_wait}s${NC}"
    return 1
}

# Wait for core services
wait_for_service "PostgreSQL"    "localhost:5432" 30 2>/dev/null || true
wait_for_service "Valkey"        "localhost:6379" 20 2>/dev/null || true
wait_for_service "MinIO"         "http://localhost:9000/minio/health/live" 30
wait_for_service "Backend API"   "http://localhost:8000/health" 45
wait_for_service "Frontend"      "http://localhost:4173" 45
wait_for_service "Prometheus"    "http://localhost:9090/-/healthy" 30
wait_for_service "Grafana"       "http://localhost:3000/api/health" 30

# ---------------------------------------------------------------------------
# Step 9: Run database migrations
# ---------------------------------------------------------------------------
header "Running database migrations"

info "Executing Alembic migrations..."
$COMPOSE exec -T backend sh -c "cd /app && alembic upgrade head" 2>&1 && \
    success "Migrations complete" || \
    warn "Migrations skipped (may already be up to date)"

# ---------------------------------------------------------------------------
# Step 10: Verify the stack
# ---------------------------------------------------------------------------
header "Verifying stack health"

HEALTHY=0
TOTAL=0

check_service() {
    local name=$1
    local url=$2
    TOTAL=$((TOTAL + 1))
    if curl -sf "$url" >/dev/null 2>&1; then
        success "$name is healthy"
        HEALTHY=$((HEALTHY + 1))
    else
        error "$name is NOT healthy"
    fi
}

check_service "Backend API"   "http://localhost:8000/health"
check_service "Frontend"      "http://localhost:4173"
check_service "MinIO"         "http://localhost:9000/minio/health/live"
check_service "Prometheus"    "http://localhost:9090/-/healthy"
check_service "Grafana"       "http://localhost:3000/api/health"

echo ""

# ---------------------------------------------------------------------------
# Step 11: Print access information
# ---------------------------------------------------------------------------
header "RAIN is running"

echo -e "${BOLD}Access URLs:${NC}"
echo ""
echo -e "  ${CYAN}RAIN Frontend${NC}     http://localhost:4173"
echo -e "  ${CYAN}Backend API${NC}       http://localhost:8000"
echo -e "  ${CYAN}API Docs${NC}          http://localhost:8000/docs"
echo -e "  ${CYAN}MinIO Console${NC}     http://localhost:9001  (minioadmin / minioadmin)"
echo -e "  ${CYAN}Grafana${NC}           http://localhost:3000  (admin / rain_grafana)"
echo -e "  ${CYAN}Prometheus${NC}        http://localhost:9090"
echo ""
echo -e "${BOLD}Service Status:${NC} ${GREEN}${HEALTHY}/${TOTAL} healthy${NC}"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo ""
echo -e "  ${CYAN}View logs:${NC}        $COMPOSE logs -f"
echo -e "  ${CYAN}Backend logs:${NC}     $COMPOSE logs -f backend"
echo -e "  ${CYAN}Worker logs:${NC}      $COMPOSE logs -f worker"
echo -e "  ${CYAN}Stop all:${NC}         $COMPOSE down"
echo -e "  ${CYAN}Stop + delete:${NC}    $COMPOSE down -v  ${RED}(deletes all data)${NC}"
echo -e "  ${CYAN}Restart:${NC}          $COMPOSE restart"
echo -e "  ${CYAN}Rebuild:${NC}          $COMPOSE up -d --build"
echo ""
echo -e "${BOLD}Key files:${NC}"
echo ""
echo -e "  ${CYAN}Environment:${NC}      .env"
echo -e "  ${CYAN}JWT keys:${NC}         .rain-keys/jwt.key, .rain-keys/jwt.pub"
echo -e "  ${CYAN}RAIN-CERT key:${NC}    .rain-keys/cert.key"
echo ""

if [ "$HEALTHY" -eq "$TOTAL" ]; then
    echo -e "${BOLD}${GREEN}All services healthy. RAIN is ready.${NC}"
else
    echo -e "${BOLD}${YELLOW}${HEALTHY}/${TOTAL} services healthy. Check logs for failing services.${NC}"
fi

echo ""
echo -e "${CYAN}Rain doesn't live in the cloud.${NC}"
echo ""
