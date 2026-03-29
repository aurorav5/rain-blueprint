import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'

// Register + login once per VU
export function setup() {
  const email = `loadtest_${Date.now()}_${Math.random()}@rain.test`
  const password = 'loadtest123'
  http.post(`${BASE_URL}/api/v1/auth/register`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  })
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  })
  return { token: loginRes.json('access_token') }
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
  }

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`, { headers })
  check(healthRes, { 'health OK': (r) => r.status === 200 })

  // Session list (lightweight read path)
  const sessRes = http.get(`${BASE_URL}/api/v1/sessions/`, { headers })
  check(sessRes, { 'sessions 200 or 404': (r) => r.status === 200 || r.status === 404 })

  sleep(1)
}
