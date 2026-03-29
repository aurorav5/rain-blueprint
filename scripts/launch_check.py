#!/usr/bin/env python3
"""
Pre-launch verification script for RAIN.
Run before any production deployment.
Exits with code 0 if all checks pass, 1 if any fail.
"""
from __future__ import annotations
import sys
import os
import json
from pathlib import Path


def main(env: str = "staging") -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, passed: bool, detail: str = "") -> None:
        checks.append((name, passed, detail))
        status = "✓" if passed else "✗"
        print(f"  {status}  {name}" + (f" — {detail}" if detail else ""))

    print(f"\n=== RAIN Launch Readiness Check ({env}) ===\n")

    # 1. RAIN_NORMALIZATION_VALIDATED gate
    gate = os.environ.get("RAIN_NORMALIZATION_VALIDATED", "false").lower() == "true"
    if env == "production":
        check("RAIN_NORMALIZATION_VALIDATED", gate, "REQUIRED for production")
    else:
        check("RAIN_NORMALIZATION_VALIDATED", True, f"{'enabled' if gate else 'disabled (staging OK)'}")

    # 2. JWT keys configured
    jwt_pub = os.environ.get("JWT_PUBLIC_KEY_PATH", "")
    jwt_priv = os.environ.get("JWT_PRIVATE_KEY_PATH", "")
    check("JWT keys configured", bool(jwt_pub and jwt_priv),
          f"pub={jwt_pub}, priv={jwt_priv}")

    # 3. RAIN-CERT signing key exists
    cert_key = os.environ.get("RAIN_CERT_SIGNING_KEY_PATH", "")
    cert_exists = Path(cert_key).exists() if cert_key else False
    check("RAIN-CERT signing key", cert_exists, cert_key or "RAIN_CERT_SIGNING_KEY_PATH not set")

    # 4. Stripe webhook secret set and non-default
    stripe_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    check("Stripe webhook secret", bool(stripe_secret and stripe_secret != "whsec_"),
          "set" if stripe_secret else "NOT SET")

    # 5. Stripe API key not test key in production
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if env == "production":
        check("Stripe live key", stripe_key.startswith("sk_live_"), stripe_key[:12] + "...")
    else:
        check("Stripe test key", bool(stripe_key), "staging: test key OK")

    # 6. S3 bucket configured
    s3_bucket = os.environ.get("S3_BUCKET", "")
    check("S3 bucket configured", bool(s3_bucket), s3_bucket or "NOT SET")

    # 7. Database URL configured
    db_url = os.environ.get("DATABASE_URL", "")
    check("DATABASE_URL configured", bool(db_url), "set" if db_url else "NOT SET")

    # 8. Redis URL configured
    redis_url = os.environ.get("REDIS_URL", "")
    check("REDIS_URL configured", bool(redis_url), "set" if redis_url else "NOT SET")

    # 9. WASM hash file exists (if WASM binary is deployed)
    wasm_hash_path = Path("frontend/public/wasm/rain_dsp.wasm.sha256")
    check("WASM hash file present", wasm_hash_path.exists(),
          str(wasm_hash_path) if wasm_hash_path.exists() else "not found (run build_wasm.sh first)")

    # Summary
    total = len(checks)
    passed = sum(1 for _, ok, _ in checks if ok)
    failed = total - passed

    print(f"\n=== Result: {passed}/{total} checks passed ===")
    if failed > 0:
        print(f"\nFailed checks: {failed}")
        for name, ok, detail in checks:
            if not ok:
                print(f"  ✗ {name}: {detail}")

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
