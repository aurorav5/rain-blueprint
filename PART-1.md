# RAIN — PART-1: Foundation
## Scaffold, Docker, Database Schema, CI/CD Baseline

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-1  
**Depends on:** Nothing — this is the starting point  
**Gates next:** PART-2 and PART-3 (can run in parallel after this part completes)

---

## Entry Checklist (confirm before starting)
- [ ] Pre-Flight Report completed and verified (see CLAUDE.md §Pre-Flight)
- [ ] File structure source: CLAUDE.md §File Structure (canonical, do not invent directories)
- [ ] Environment variables source: CLAUDE.md §Environment Variables (copy verbatim)
- [ ] Every table with user data MUST have RLS enabled — zero exceptions
- [ ] S3 prefix: `users/{user_id}/{session_id}/{file_hash}.{ext}` — hardcoded pattern
- [ ] No secrets in code — all via environment variables, `.env.example` in repo root
- [ ] Error codes: RAIN-E* and RAIN-B* only — never raw exception messages to client
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Stand up the complete repository skeleton, Docker development environment, PostgreSQL schema
with Row-Level Security, Redis, MinIO (S3-compatible), and a passing CI baseline. At the end
of this part, `docker-compose up` must bring the entire stack to a healthy state and all
database migrations must apply cleanly.

No application logic. No DSP. No ML. Just infrastructure that everything else builds on.

---

## Task 1.1 — Repository Skeleton

Create the exact directory structure defined in CLAUDE.md §File Structure. Do not create
placeholder files (`.gitkeep` is fine). Create the following config files with correct content:

### `.gitignore`
```
# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.egg-info/
dist/
build/
.env
.venv/
venv/

# Node
node_modules/
dist/
.vite/
*.tsbuildinfo

# C++
rain-dsp/build/
rain-dsp/build-wasm/
*.o
*.a
*.so
*.wasm (keep .wasm built artifacts, ignore intermediate)

# Secrets
*.key
*.pem
*.p12
.env.local
.env.production
/etc/rain/

# IDE
.vscode/
.idea/
*.swp

# Docker
.docker/

# ML
models/checkpoints/
ml/*/runs/
*.pt
*.pth
ml/*/wandb/

# OS
.DS_Store
Thumbs.db
```

### `.env.example`
Copy verbatim from CLAUDE.md §Environment Variables. Add these additional variables:
```bash
# PART-1 additions
POSTGRES_PASSWORD=changeme_in_production
POSTGRES_USER=rain_app
POSTGRES_DB=rain
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# Content verification (PART-8)
ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com
ACRCLOUD_ACCESS_KEY=
ACRCLOUD_ACCESS_SECRET=
AUDD_API_TOKEN=
CHROMAPRINT_FPCALC_PATH=/usr/local/bin/fpcalc

# Distribution (PART-9)
LABELGRID_API_KEY=
LABELGRID_API_BASE=https://api.labelgrid.com/v2
LABELGRID_SANDBOX=true
ISRC_REGISTRANT_CODE=
UPC_GS1_PREFIX=

# Atmos (PART-12)
ATMOS_ENABLED=false
```

---

## Task 1.2 — Docker Compose

Create `docker-compose.yml` with these services:

### Services required:

**postgres**
- Image: `postgres:15-alpine`
- Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Volume: `postgres_data:/var/lib/postgresql/data`
- Healthcheck: `pg_isready -U rain_app -d rain`
- Port: `5432:5432`

**redis**
- Image: `redis:7-alpine`
- Command: `redis-server --appendonly yes`
- Volume: `redis_data:/data`
- Healthcheck: `redis-cli ping`
- Port: `6379:6379`

**minio**
- Image: `minio/minio:latest`
- Command: `server /data --console-address ":9001"`
- Environment: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- Volume: `minio_data:/data`
- Port: `9000:9000`, `9001:9001`
- Healthcheck: `curl -f http://localhost:9000/minio/health/live`

**minio-init** (one-shot)
- Image: `minio/mc:latest`
- Depends on: `minio` (healthy)
- Command: Create `rain-audio` bucket with policy: private
- Entrypoint script:
  ```bash
  mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
  mc mb --ignore-existing local/rain-audio
  mc anonymous set none local/rain-audio
  ```

**backend**
- Build: `docker/Dockerfile.backend`
- Depends on: `postgres` (healthy), `redis` (healthy), `minio` (healthy)
- Volumes: `./backend:/app`, `/etc/rain:/etc/rain:ro`
- Env file: `.env`
- Port: `8000:8000`
- Command: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

**worker**
- Build: `docker/Dockerfile.worker`
- Depends on: `postgres` (healthy), `redis` (healthy), `minio` (healthy)
- Same env as backend
- Command: `celery -A app.worker worker --loglevel=info -Q default,demucs,distribution,certification`

**frontend**
- Build: `docker/Dockerfile.frontend`
- Volumes: `./frontend:/app`, `/app/node_modules`
- Port: `5173:5173`
- Command: `npm run dev -- --host`

**nginx** (optional in dev, required in prod — add with `--profile prod`)
- Image: `nginx:alpine`
- Config: `nginx/nginx.conf`
- Ports: `80:80`, `443:443`
- Profile: `prod`

Volumes declaration: `postgres_data`, `redis_data`, `minio_data`

---

## Task 1.3 — Dockerfiles

### `docker/Dockerfile.backend`
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    ffmpeg \
    chromaprint-tools \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App
COPY backend/ .

# Non-root user
RUN useradd -m -u 1000 rain && chown -R rain:rain /app
USER rain

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `docker/Dockerfile.worker`
```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    ffmpeg \
    chromaprint-tools \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Demucs (heavy — separate layer)
RUN pip install --no-cache-dir demucs

COPY backend/ .

RUN useradd -m -u 1000 rain && chown -R rain:rain /app
USER rain

CMD ["celery", "-A", "app.worker", "worker", "--loglevel=info"]
```

### `docker/Dockerfile.frontend`
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

---

## Task 1.4 — Backend Project Structure

Create the following files with minimal but correct content:

### `backend/requirements.txt`
```
fastapi==0.109.2
uvicorn[standard]==0.27.1
sqlalchemy==2.0.27
asyncpg==0.29.0
alembic==1.13.1
redis==5.0.1
celery==5.3.6
boto3==1.34.34
pydantic==2.6.1
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
httpx==0.26.0
stripe==8.3.0
anthropic==0.18.1
onnxruntime==1.17.0
numpy==1.26.4
scipy==1.12.0
librosa==0.10.1
soundfile==0.12.1
pytest==8.0.2
pytest-asyncio==0.23.5
pytest-httpx==0.28.0
prometheus-fastapi-instrumentator==6.1.0
structlog==24.1.0
sentry-sdk[fastapi]==1.40.6
cryptography==42.0.2
```

### `backend/app/__init__.py` — empty

### `backend/app/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.observability import setup_observability

app = FastAPI(
    title="RAIN API",
    version=settings.RAIN_VERSION,
    docs_url="/docs" if settings.RAIN_ENV != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_observability(app)

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": settings.RAIN_VERSION, "env": settings.RAIN_ENV}
```

### `backend/app/core/config.py`
```python
from pydantic_settings import BaseSettings
from typing import Literal

class Settings(BaseSettings):
    RAIN_ENV: Literal["development", "staging", "production"] = "development"
    RAIN_VERSION: str = "6.0.0"
    RAIN_LOG_LEVEL: str = "debug"

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"

    S3_BUCKET: str = "rain-audio"
    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "RS256"
    JWT_PUBLIC_KEY_PATH: str = "/etc/rain/jwt.pub"
    JWT_PRIVATE_KEY_PATH: str = "/etc/rain/jwt.key"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    RAIN_NORMALIZATION_VALIDATED: bool = False
    ANTHROPIC_API_KEY: str = ""
    ONNX_MODEL_PATH: str = "/models/rain_base.onnx"
    DEMUCS_MODEL: str = "htdemucs_6s"
    DEMUCS_DEVICE: str = "cpu"

    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

settings = Settings()
```

### `backend/app/core/database.py`
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.RAIN_ENV == "development",
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

### `backend/app/core/observability.py`
```python
import structlog
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

def setup_observability(app: FastAPI) -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

---

## Task 1.5 — Database Schema and Migrations

Initialize Alembic: `alembic init backend/migrations`

Create the initial migration with this exact schema. **RLS must be enabled on every table
that contains user data.**

### Schema: `backend/migrations/versions/0001_initial_schema.py`

Create tables in this order (respecting FK dependencies):

**1. `users`**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT,  -- NULL for OAuth/passwordless
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users USING (id = current_setting('app.user_id')::UUID);
```

**2. `subscriptions`**
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK (tier IN ('free','spark','creator','artist','studio_pro','enterprise')),
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','trialing')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner ON subscriptions USING (user_id = current_setting('app.user_id')::UUID);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
```

**3. `usage_quotas`**
```sql
CREATE TABLE usage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    renders_used INTEGER NOT NULL DEFAULT 0,
    downloads_used INTEGER NOT NULL DEFAULT 0,
    claude_calls_used INTEGER NOT NULL DEFAULT 0,
    stem_renders_used INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_quotas_owner ON usage_quotas USING (user_id = current_setting('app.user_id')::UUID);
CREATE UNIQUE INDEX idx_usage_quotas_user_period ON usage_quotas(user_id, period_start);
```

**4. `sessions`** (mastering sessions — NOT auth sessions)
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('uploading','analyzing','processing','complete','failed')),
    tier_at_creation TEXT NOT NULL,
    input_file_key TEXT,         -- S3 key, NULL for free tier
    input_file_hash TEXT,        -- SHA-256 of original file
    input_duration_ms INTEGER,
    input_lufs NUMERIC(6,2),
    input_true_peak NUMERIC(6,2),
    output_file_key TEXT,        -- S3 key, NULL for free tier
    output_file_hash TEXT,
    output_lufs NUMERIC(6,2),
    output_true_peak NUMERIC(6,2),
    target_platform TEXT,
    simple_mode BOOLEAN NOT NULL DEFAULT TRUE,
    genre TEXT,
    aie_applied BOOLEAN NOT NULL DEFAULT FALSE,
    rain_score JSONB,
    rain_cert_id UUID,
    wasm_binary_hash TEXT NOT NULL,
    rainnet_model_version TEXT,
    processing_params JSONB,
    error_code TEXT,
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_owner ON sessions USING (user_id = current_setting('app.user_id')::UUID);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

**5. `stems`**
```sql
CREATE TABLE stems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stem_role TEXT NOT NULL CHECK (stem_role IN ('vocals','drums','bass','instruments','fx','accompaniment','mix','other')),
    file_key TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    duration_ms INTEGER,
    source TEXT CHECK (source IN ('uploaded','demucs','suno','udio')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stems ENABLE ROW LEVEL SECURITY;
CREATE POLICY stems_owner ON stems USING (user_id = current_setting('app.user_id')::UUID);
CREATE INDEX idx_stems_session_id ON stems(session_id);
```

**6. `aie_profiles`**
```sql
CREATE TABLE aie_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voice_vector JSONB NOT NULL DEFAULT '[]',  -- 64-dim float array
    session_count INTEGER NOT NULL DEFAULT 0,
    genre_distribution JSONB NOT NULL DEFAULT '{}',
    platform_preferences JSONB NOT NULL DEFAULT '{}',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE aie_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY aie_profiles_owner ON aie_profiles USING (user_id = current_setting('app.user_id')::UUID);
```

**7. `rain_certs`**
```sql
CREATE TABLE rain_certs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    wasm_hash TEXT NOT NULL,
    model_version TEXT NOT NULL,
    processing_params_hash TEXT NOT NULL,
    ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ai_source TEXT,  -- 'suno', 'udio', 'other', NULL
    content_scan_passed BOOLEAN,
    signature TEXT NOT NULL,  -- Ed25519 sig of canonical JSON
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rain_certs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rain_certs_owner ON rain_certs USING (user_id = current_setting('app.user_id')::UUID);
```

**8. `content_scans`**
```sql
CREATE TABLE content_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    chromaprint_fingerprint TEXT,
    acoustid_result JSONB,
    audd_result JSONB,
    acrcloud_result JSONB,
    overall_status TEXT NOT NULL CHECK (overall_status IN ('clear','match_found','error','pending')),
    match_title TEXT,
    match_artist TEXT,
    match_confidence NUMERIC(4,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE content_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_scans_owner ON content_scans USING (user_id = current_setting('app.user_id')::UUID);
```

**9. `releases`** (distribution)
```sql
CREATE TABLE releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    album_title TEXT,
    isrc TEXT UNIQUE,
    upc TEXT,
    release_date DATE,
    genre TEXT,
    explicit BOOLEAN NOT NULL DEFAULT FALSE,
    ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ai_source TEXT,
    ddex_status TEXT CHECK (ddex_status IN ('pending','submitted','delivered','error')),
    labelgrid_release_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY releases_owner ON releases USING (user_id = current_setting('app.user_id')::UUID);
CREATE INDEX idx_releases_user_id ON releases(user_id);
```

After creating all tables, create a helper function for RLS:
```sql
CREATE OR REPLACE FUNCTION set_app_user_id(user_id UUID) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.user_id', user_id::TEXT, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Task 1.6 — CI/CD Configuration

### `.github/workflows/ci.yml`
```yaml
name: RAIN CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: rain_app
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: rain_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install deps
        run: pip install -r backend/requirements.txt
      - name: Run migrations
        run: alembic upgrade head
        working-directory: backend
        env:
          DATABASE_URL: postgresql+asyncpg://rain_app:testpassword@localhost:5432/rain_test
      - name: Run tests
        run: pytest backend/tests/ -v --tb=short
        env:
          RAIN_ENV: development
          DATABASE_URL: postgresql+asyncpg://rain_app:testpassword@localhost:5432/rain_test
          REDIS_URL: redis://localhost:6379/0
          JWT_SECRET_KEY: test_secret
          S3_ACCESS_KEY: test
          S3_SECRET_KEY: test

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install deps
        run: npm ci
        working-directory: frontend
      - name: Type check
        run: npm run typecheck
        working-directory: frontend
      - name: Build
        run: npm run build
        working-directory: frontend

  dsp-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install CMake + deps
        run: sudo apt-get install -y cmake build-essential libfftw3-dev
      - name: Build
        run: |
          mkdir -p rain-dsp/build
          cd rain-dsp/build
          cmake .. -DCMAKE_BUILD_TYPE=Release
          make -j$(nproc)
      - name: Test
        run: ctest --test-dir rain-dsp/build -V
```

### `scripts/setup.sh`
```bash
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
```

Make executable: `chmod +x scripts/setup.sh`

---

## Task 1.7 — Frontend Initialization

Initialize the frontend project:
```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install tailwindcss @tailwindcss/vite
npm install -D typescript @types/node
```

Configure `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Create minimal `src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <h1 className="text-4xl font-bold">R∞N</h1>
    </div>
  )
}
```

---

## Task 1.8 — NGINX Configuration (Production)

### `nginx/nginx.conf`
```nginx
upstream backend {
    server backend:8000;
}

upstream frontend {
    server frontend:5173;
}

server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        client_max_body_size 500M;  # large audio files
    }

    # Health / metrics (internal only)
    location /health {
        proxy_pass http://backend;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }

    # WebSocket for collaboration
    location /ws/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
    }
}
```

---

## Build Command

```bash
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python -c "from app.core.database import engine; print('DB OK')"
```

---

## Tests to Pass Before Reporting

### 1. Stack health
```bash
docker-compose ps
# All services must show "healthy" or "running"
```

### 2. Database migrations
```bash
docker-compose exec backend alembic current
# Must show "head"
```

### 3. RLS verification
```sql
-- Connect to DB and run:
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = FALSE;
-- Result must be empty (zero rows)
```

### 4. Backend health
```bash
curl http://localhost:8000/health
# Must return: {"status": "ok", "version": "6.0.0", "env": "development"}
```

### 5. Frontend build
```bash
cd frontend && npm run build
# Must complete with zero type errors
```

### 6. MinIO bucket
```bash
docker-compose exec minio-init mc ls local/
# Must show rain-audio bucket
```

---

## Report Format

After all tests pass:
```
PART-1 COMPLETE
Files created: [list]
Migrations: [N] tables, RLS enabled on [N] tables
Stack status: all services healthy
Backend health: OK
Frontend build: OK
Deviations from spec: [none | list any]
Ready for: PART-2 (RainDSP) and PART-3 (Backend Core) — may proceed in parallel
```

**HALT. Wait for instruction: "Proceed to Part 2" or "Proceed to Part 3".**
