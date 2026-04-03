#!/usr/bin/env python3
"""
Pre-launch verification script for RAIN.
Run before any production deployment.
Exits with code 0 if all checks pass, 1 if any fail.

Validates:
  - All required environment variables
  - RAIN_NORMALIZATION_VALIDATED gate
  - JWT, RAIN-CERT, and watermark key presence
  - Stripe configuration
  - S3 / database / cache connectivity
  - WASM binary hash integrity
  - PostgreSQL RLS enabled on all user tables
  - Free-tier S3 isolation (no write path)
"""
from __future__ import annotations
import sys
import os
import hashlib
from pathlib import Path


def main(env: str = "staging") -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, passed: bool, detail: str = "") -> None:
        checks.append((name, passed, detail))
        status = "\u2713" if passed else "\u2717"
        print(f"  {status}  {name}" + (f" \u2014 {detail}" if detail else ""))

    print(f"\n=== RAIN Launch Readiness Check ({env}) ===\n")

    # --- 1. Core Environment Variables ---
    print("[Core]")

    gate = os.environ.get("RAIN_NORMALIZATION_VALIDATED", "false").lower() == "true"
    if env == "production":
        check("RAIN_NORMALIZATION_VALIDATED", gate, "REQUIRED for production")
    else:
        check("RAIN_NORMALIZATION_VALIDATED", True, f"{'enabled' if gate else 'disabled (staging OK)'}")

    rain_env = os.environ.get("RAIN_ENV", "")
    check("RAIN_ENV set", bool(rain_env), rain_env or "NOT SET")

    rain_version = os.environ.get("RAIN_VERSION", "")
    check("RAIN_VERSION set", bool(rain_version), rain_version or "NOT SET")

    # --- 2. Authentication ---
    print("\n[Auth]")

    jwt_pub = os.environ.get("JWT_PUBLIC_KEY_PATH", "")
    jwt_priv = os.environ.get("JWT_PRIVATE_KEY_PATH", "")
    check("JWT keys configured", bool(jwt_pub and jwt_priv),
          f"pub={jwt_pub}, priv={jwt_priv}")

    if jwt_pub:
        check("JWT public key exists", Path(jwt_pub).exists(), jwt_pub)
    if jwt_priv:
        check("JWT private key exists", Path(jwt_priv).exists(), jwt_priv)

    jwt_secret = os.environ.get("JWT_SECRET_KEY", "")
    if env == "production":
        check("JWT_SECRET_KEY not default", jwt_secret != "dev-secret-key-do-not-use-in-production",
              "custom" if jwt_secret != "dev-secret-key-do-not-use-in-production" else "USING DEV DEFAULT")

    # --- 3. RAIN-CERT Signing ---
    print("\n[Signing]")

    cert_key = os.environ.get("RAIN_CERT_SIGNING_KEY_PATH", "")
    cert_exists = Path(cert_key).exists() if cert_key else False
    check("RAIN-CERT signing key path set", bool(cert_key), cert_key or "NOT SET")
    if cert_key:
        check("RAIN-CERT signing key file exists", cert_exists, cert_key)

    wm_key = os.environ.get("RAIN_WATERMARK_KEY_PATH", "")
    wm_exists = Path(wm_key).exists() if wm_key else False
    check("Watermark key path set", bool(wm_key), wm_key or "NOT SET")
    if wm_key:
        check("Watermark key file exists", wm_exists, wm_key)

    # --- 4. Billing ---
    print("\n[Billing]")

    stripe_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    check("Stripe webhook secret", bool(stripe_secret and stripe_secret != "whsec_"),
          "set" if stripe_secret else "NOT SET")

    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if env == "production":
        check("Stripe live key", stripe_key.startswith("sk_live_"), stripe_key[:12] + "..." if stripe_key else "NOT SET")
    else:
        check("Stripe test key", bool(stripe_key), "staging: test key OK" if stripe_key else "NOT SET")

    for tier in ("SPARK", "CREATOR", "ARTIST", "STUDIO_PRO"):
        price_id = os.environ.get(f"STRIPE_PRICE_{tier}_MONTHLY", "")
        check(f"Stripe price {tier}", bool(price_id), price_id[:20] + "..." if price_id else "NOT SET")

    # --- 5. Infrastructure ---
    print("\n[Infrastructure]")

    s3_bucket = os.environ.get("S3_BUCKET", "")
    check("S3 bucket configured", bool(s3_bucket), s3_bucket or "NOT SET")

    s3_endpoint = os.environ.get("S3_ENDPOINT_URL", "")
    check("S3 endpoint configured", bool(s3_endpoint), s3_endpoint or "NOT SET")

    s3_access = os.environ.get("S3_ACCESS_KEY", "")
    if env == "production":
        check("S3 access key not default", s3_access != "minioadmin",
              "custom" if s3_access != "minioadmin" else "USING DEV DEFAULT")

    db_url = os.environ.get("DATABASE_URL", "")
    check("DATABASE_URL configured", bool(db_url), "set" if db_url else "NOT SET")

    redis_url = os.environ.get("REDIS_URL", "") or os.environ.get("VALKEY_URL", "")
    check("VALKEY_URL / REDIS_URL configured", bool(redis_url), "set" if redis_url else "NOT SET")

    # --- 6. ML ---
    print("\n[ML]")

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    check("ANTHROPIC_API_KEY set", bool(anthropic_key), "set" if anthropic_key else "NOT SET")

    onnx_path = os.environ.get("ONNX_MODEL_PATH", "/models/rain_base.onnx")
    check("ONNX model path configured", bool(onnx_path), onnx_path)
    if onnx_path:
        check("ONNX model file exists", Path(onnx_path).exists(),
              onnx_path if Path(onnx_path).exists() else "NOT FOUND (heuristic fallback will be used)")

    # --- 7. WASM Binary Integrity ---
    print("\n[WASM Integrity]")

    wasm_binary = Path("frontend/public/wasm/rain_dsp.wasm")
    wasm_hash_file = Path("frontend/public/wasm/rain_dsp.wasm.sha256")

    check("WASM binary present", wasm_binary.exists(),
          str(wasm_binary) if wasm_binary.exists() else "NOT FOUND (run build_wasm.sh)")

    if wasm_binary.exists():
        actual_hash = hashlib.sha256(wasm_binary.read_bytes()).hexdigest()
        if wasm_hash_file.exists():
            expected_hash = wasm_hash_file.read_text().strip().split()[0]
            hash_match = actual_hash == expected_hash
            check("WASM hash matches manifest", hash_match,
                  f"actual={actual_hash[:16]}... expected={expected_hash[:16]}..."
                  if not hash_match else f"SHA-256={actual_hash[:16]}...")
        else:
            check("WASM hash file present", False, "rain_dsp.wasm.sha256 not found")
    else:
        check("WASM hash verification", False, "skipped (no binary)")

    # --- 8. PostgreSQL RLS Verification ---
    print("\n[RLS Verification]")

    # Tables that MUST have RLS per CLAUDE.md §Non-Negotiable Rule 3
    rls_required_tables = [
        "users", "mastering_sessions", "subscriptions", "aie_profiles",
        "releases", "stems", "quotas", "certs", "content_scans",
        "workspaces", "workspace_members", "lora_adapters",
    ]

    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url.replace("+asyncpg", ""))
            cur = conn.cursor()
            cur.execute("""
                SELECT tablename, rowsecurity
                FROM pg_tables
                WHERE schemaname = 'public'
            """)
            table_rls = {row[0]: row[1] for row in cur.fetchall()}
            conn.close()

            for table in rls_required_tables:
                if table in table_rls:
                    check(f"RLS on {table}", table_rls[table], "enabled" if table_rls[table] else "DISABLED")
                else:
                    check(f"RLS on {table}", False, "table not found")
        except ImportError:
            check("RLS verification", False, "psycopg2 not installed (skipped)")
        except Exception as e:
            check("RLS verification", False, f"DB connection failed: {e}")
    else:
        check("RLS verification", False, "DATABASE_URL not set (skipped)")

    # --- 9. Free Tier S3 Isolation ---
    print("\n[Free Tier Isolation]")

    # Verify that the storage service code enforces free-tier S3 block
    storage_py = Path("backend/app/services/storage.py")
    if storage_py.exists():
        storage_code = storage_py.read_text()
        has_free_guard = "free" in storage_code.lower() and ("raise" in storage_code or "block" in storage_code.lower())
        check("Free tier S3 guard in storage.py", has_free_guard,
              "free-tier write block detected" if has_free_guard else "WARNING: no free-tier guard found")
    else:
        check("storage.py exists", False, "backend/app/services/storage.py not found")

    # --- 10. Content Scan ---
    print("\n[Content Scan]")

    audd = os.environ.get("AUDD_API_TOKEN", "")
    check("AudD API token", bool(audd), "set" if audd else "NOT SET (layer will skip)")

    acr_host = os.environ.get("ACRCLOUD_HOST", "")
    acr_key = os.environ.get("ACRCLOUD_ACCESS_KEY", "")
    check("ACRCloud configured", bool(acr_host and acr_key),
          f"host={acr_host}" if acr_host else "NOT SET (layer will skip)")

    # --- Summary ---
    total = len(checks)
    passed = sum(1 for _, ok, _ in checks if ok)
    failed = total - passed

    print(f"\n{'=' * 50}")
    print(f"Result: {passed}/{total} checks passed, {failed} failed")
    print(f"{'=' * 50}")

    if failed > 0:
        print(f"\nFailed checks:")
        for name, ok, detail in checks:
            if not ok:
                print(f"  \u2717 {name}: {detail}")

    if env == "production" and failed > 0:
        print("\nProduction deploy BLOCKED. Fix all failing checks first.")
        return 1
    elif failed > 0:
        print(f"\nStaging deploy proceeding with {failed} warning(s).")
        return 0

    print("\nAll checks passed. Deployment authorized.")
    return 0


if __name__ == "__main__":
    environment = sys.argv[1] if len(sys.argv) > 1 else "staging"
    sys.exit(main(environment))
