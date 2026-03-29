# RAIN — PART-12: Production Hardening
## Monitoring, E2E Tests, Load Testing, CloudFront Deploy

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-12  
**Depends on:** All previous parts complete  
**Gates next:** LAUNCH — this is the final gate

---

## Entry Checklist (confirm before starting)
- [ ] All PART-1 through PART-11 tests still pass — no regressions
- [ ] Structured logging (structlog) with session_id, user_id, stage, duration_ms on all paths
- [ ] All Prometheus metrics use RAIN-prefixed names, not generic labels
- [ ] E2E tests cover: register → upload → master → download (happy path) + all tier gates
- [ ] Load test: k6 must verify no memory leaks under sustained load (Celery workers, DB connections)
- [ ] WASM binary served via CDN with correct cache headers and SHA-256 integrity
- [ ] Production Docker images: no dev dependencies, no .env files, no debug logging
- [ ] No fake data anywhere in the production build — audit all stubs
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Harden for production: complete Prometheus/Grafana observability, Playwright E2E test suite,
k6 load tests, CloudFront CDN configuration, production Docker builds, and launch readiness
checklist verification. Also implements the Dolby Atmos automated upmixing (Studio Pro).

---

## Task 12.1 — Prometheus Metrics

### `monitoring/prometheus.yml`
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: rain_backend
    static_configs:
      - targets: ['backend:8000']
    metrics_path: /metrics

  - job_name: rain_worker
    static_configs:
      - targets: ['worker:9808']  # celery-exporter

  - job_name: postgres
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: redis
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Custom Metrics (add to backend):
```python
from prometheus_client import Counter, Histogram, Gauge

SESSIONS_CREATED = Counter("rain_sessions_created_total", "Sessions created", ["tier", "platform"])
RENDER_DURATION = Histogram("rain_render_duration_seconds", "Render duration", ["source"])
RENDER_LUFS_ERROR = Histogram("rain_render_lufs_error_lu", "LUFS deviation from target")
ACTIVE_SESSIONS = Gauge("rain_active_sessions", "Currently processing sessions")
NORMALIZATION_GATE = Gauge("rain_normalization_gate", "RAIN_NORMALIZATION_VALIDATED status")
```

---

## Task 12.2 — Grafana Dashboards

### `monitoring/grafana/dashboards/rain_overview.json`
Create dashboard panels for:
- Session creation rate (per tier, per platform)
- Render duration P50/P95/P99
- LUFS deviation distribution (target vs actual)
- Active sessions gauge
- Error rate by RAIN-E* code
- Worker queue depth
- S3 storage usage
- Stripe webhook events

---

## Task 12.3 — Playwright E2E Test Suite

### `tests/e2e/` directory

```typescript
// tests/e2e/mastering-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('RAIN E2E Mastering Flow', () => {
  test('complete mastering session: upload → render → download', async ({ page }) => {
    // 1. Register new user
    await page.goto('/register')
    await page.fill('[data-testid=email]', `e2e_${Date.now()}@test.rain`)
    await page.fill('[data-testid=password]', 'testpass123')
    await page.click('[data-testid=register-submit]')
    await expect(page).toHaveURL('/')

    // 2. Upload test WAV
    const fileInput = page.locator('[data-testid=file-upload]')
    await fileInput.setInputFiles('tests/fixtures/test_30s_48k.wav')
    await expect(page.locator('[data-testid=file-info]')).toBeVisible()

    // 3. Start mastering
    await page.click('[data-testid=master-button]')
    await expect(page.locator('[data-testid=status-analyzing]')).toBeVisible()

    // 4. Wait for completion (max 60s)
    await expect(page.locator('[data-testid=status-complete]')).toBeVisible({ timeout: 60000 })

    // 5. Verify LUFS display
    const lufsDisplay = page.locator('[data-testid=output-lufs]')
    await expect(lufsDisplay).toBeVisible()

    // 6. RAIN Score displayed
    await expect(page.locator('[data-testid=rain-score]')).toBeVisible()
  })

  test('free tier: download button is locked', async ({ page }) => {
    // ... authenticate as free user, complete session, verify download locked
  })

  test('tier gate: stems tab locked for free/spark', async ({ page }) => {
    // ...
  })

  test('Suno import mode: 3 stems upload → session created with ai_generated=true', async ({ page }) => {
    // ...
  })
})
```

---

## Task 12.4 — k6 Load Testing

### `tests/load/mastering_load.js`
```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up to 50 concurrent
    { duration: '5m', target: 50 },   // hold
    { duration: '2m', target: 100 },  // peak
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // less than 1% errors
  },
}

export default function () {
  // Test upload endpoint with small WAV
  const res = http.post(`${__ENV.BASE_URL}/api/v1/sessions/`, ...)
  check(res, { 'status is 201': (r) => r.status === 201 })
  sleep(1)
}
```

---

## Task 12.5 — Dolby Atmos Upmixing (Studio Pro)

### `backend/app/services/atmos.py`
```python
async def upmix_to_atmos(
    audio_data: bytes,
    stems: list[dict],  # stem data from session
    genre: str,
    binaural_preview: bool = True,
) -> dict:
    """
    Automated stereo-to-Atmos upmixing. Studio Pro only.
    Returns: {"adm_bwf": bytes, "binaural_preview": bytes | None}

    Algorithm:
    1. Load stems (or use single stereo mix if no stems)
    2. Apply genre-specific spatial template:
       - vocals: center elevated (0°, +15° tilt)
       - drums: distributed (L/R ±30°, kick center)
       - bass: low center (0°, -5°)
       - instruments: peripheral (L/R ±45° to ±60°)
       - fx: full sphere (varying elevation)
    3. Generate ADM BWF with Dolby Atmos object metadata
    4. Enforce 50ms boundary alignment (ADM requirement)
    5. Generate binaural preview via HRTF convolution
    """
```

---

## Task 12.6 — Production Docker Builds

### `docker/Dockerfile.backend.prod`
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY backend/ .
RUN useradd -m -u 1000 rain && chown -R rain:rain /app
USER rain
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### `scripts/deploy.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-staging}
echo "=== Deploying RAIN to $ENV ==="

# Build images
docker build -f docker/Dockerfile.backend.prod -t rain-backend:$(git rev-parse --short HEAD) .
docker build -f docker/Dockerfile.worker -t rain-worker:$(git rev-parse --short HEAD) .
docker build -f docker/Dockerfile.frontend.prod -t rain-frontend:$(git rev-parse --short HEAD) .

# Run migrations (zero-downtime: migrations first, then deploy)
docker run --rm --env-file .env.$ENV rain-backend:$(git rev-parse --short HEAD) \
  alembic upgrade head

# Rotate containers (replace running containers one at a time)
# In production: use ECS/Kubernetes rolling deployment here

echo "=== Deploy complete ==="
```

---

## Task 12.7 — Launch Readiness Checklist

Before any production traffic, verify every item in BLUEPRINT-INDEX.md §Launch Readiness
Criteria. The deploy script must refuse to proceed if any item is not checked off.

Add `scripts/launch_check.py`:
```python
"""
Pre-launch verification script.
Runs all checks and produces a signed readiness report.
Must pass 100% before production traffic is allowed.
"""
```

Checks to automate:
- `RAIN_NORMALIZATION_VALIDATED` env var value (warn if false, block deploy to prod)
- RLS: query all user tables without `app.user_id` set → should return zero rows
- Free tier isolation: create session as free user → S3 bucket should not gain new objects
- WASM hash: hash of deployed WASM matches `rain_dsp.wasm.sha256`
- Stripe webhook: secret is set and non-default
- JWT keys: RSA keys are 4096-bit, not the example values
- RAIN-CERT key: Ed25519 key file exists and signs correctly

---

## Tests to Pass Before Reporting

```
✓ E2E Playwright: all tests pass (including upload → complete → download)
✓ k6 load test: p95 < 500ms, error rate < 1%
✓ Prometheus: all metrics endpoints returning data
✓ Grafana: dashboard loads with data
✓ Atmos upmix: returns ADM BWF (Studio Pro tier) — structure valid
✓ Production Docker: backend builds with --no-cache, health check passes
✓ Launch readiness script: all automated checks pass
✓ WASM hash verification: in production build
```

---

## Final Report Format

```
PART-12 COMPLETE — ALL PARTS COMPLETE
E2E tests: N/N passed
Load test: p95=[X]ms, error_rate=[Y]%
Monitoring: Prometheus + Grafana operational
Production build: clean
Launch readiness: [N/N checks pass]
RAIN_NORMALIZATION_VALIDATED: false (requires ML lead + Phil Bölke sign-off before enabling)
Deployment: ready for production

PLATFORM ENDGAME STATUS: ALL 12 PARTS COMPLETE
```

**HALT. Await explicit production launch authorization from Phil Bölke.**
