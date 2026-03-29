"""End-to-end render pipeline smoke test.
Requires: running backend (localhost:8000), Redis, MinIO, and Celery worker.
"""
import requests
import time
import sys

BASE = "http://localhost:8000/api/v1"


def main() -> int:
    # Register test user
    r = requests.post(f"{BASE}/auth/register", json={
        "email": "e2e@test.rain",
        "password": "testpass123",
    }, timeout=10)
    if r.status_code not in (200, 201, 409):
        print(f"Register failed: {r.status_code} {r.text}")
        return 1

    # Login
    r = requests.post(f"{BASE}/auth/login", json={
        "email": "e2e@test.rain",
        "password": "testpass123",
    }, timeout=10)
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}")
        return 1
    tokens = r.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    # Upload test WAV
    fixture = "backend/tests/fixtures/test_48k_stereo.wav"
    try:
        f_handle = open(fixture, "rb")
    except FileNotFoundError:
        print(f"Fixture not found: {fixture}")
        print("Generate with: python scripts/generate_test_fixture.py")
        return 1

    with f_handle as fh:
        r = requests.post(
            f"{BASE}/sessions/",
            headers=headers,
            files={"file": ("test_48k_stereo.wav", fh, "audio/wav")},
            data={"target_platform": "spotify", "simple_mode": "true"},
            timeout=30,
        )
    if r.status_code not in (200, 201):
        print(f"Upload failed: {r.status_code} {r.text}")
        return 1

    session = r.json()
    session_id = session["id"]
    print(f"Session created: {session_id}")

    # Poll until complete (60s timeout)
    for i in range(60):
        time.sleep(1)
        r = requests.get(f"{BASE}/sessions/{session_id}", headers=headers, timeout=10)
        if r.status_code != 200:
            print(f"Session get failed: {r.status_code}")
            return 1
        s = r.json()
        print(f"  [{i+1:2d}s] status={s['status']}")

        if s["status"] == "complete":
            lufs = s.get("output_lufs")
            print(f"Complete. Output LUFS: {lufs}")
            assert lufs is not None, "output_lufs is None"
            assert abs(lufs - (-14.0)) <= 0.5, f"LUFS DRIFT: got {lufs}, expected -14.0 ±0.5"
            print("LUFS TEST PASSED")
            return 0
        elif s["status"] == "failed":
            print(f"FAILED: {s.get('error_code')} — {s.get('error_detail')}")
            return 1

    print("TIMEOUT: session did not complete in 60s")
    return 1


if __name__ == "__main__":
    sys.exit(main())
