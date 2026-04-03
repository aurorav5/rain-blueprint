import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

// Custom metrics
const masteringDuration = new Trend('mastering_duration_ms')
const uploadErrors = new Counter('upload_errors')
const masteringErrors = new Counter('mastering_errors')

export const options = {
  scenarios: {
    // Scenario 1: Sustained load — 50 concurrent users for 5 minutes
    sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 25 },
        { duration: '5m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    // Scenario 2: Spike — 100 users for 2 minutes
    spike: {
      executor: 'ramping-vus',
      startTime: '7m',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    mastering_duration_ms: ['p(95)<30000'],
    upload_errors: ['count<10'],
    mastering_errors: ['count<10'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'

// Generate a minimal valid WAV file (1 second, 44.1kHz mono, 16-bit silence)
function generateTestWav() {
  const sampleRate = 44100
  const numSamples = sampleRate  // 1 second
  const dataSize = numSamples * 2  // 16-bit = 2 bytes/sample
  const fileSize = 36 + dataSize

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  const enc = new TextEncoder()
  const riff = enc.encode('RIFF')
  const wave = enc.encode('WAVE')
  const fmt = enc.encode('fmt ')
  const data = enc.encode('data')

  riff.forEach((b, i) => view.setUint8(i, b))
  view.setUint32(4, fileSize, true)
  wave.forEach((b, i) => view.setUint8(8 + i, b))
  fmt.forEach((b, i) => view.setUint8(12 + i, b))
  view.setUint32(16, 16, true)     // chunk size
  view.setUint16(20, 1, true)      // PCM
  view.setUint16(22, 1, true)      // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)  // byte rate
  view.setUint16(32, 2, true)      // block align
  view.setUint16(34, 16, true)     // bits per sample
  data.forEach((b, i) => view.setUint8(36 + i, b))
  view.setUint32(40, dataSize, true)

  // Fill with a 440Hz sine wave at -20 dBFS
  const amplitude = Math.pow(10, -20 / 20) * 32767
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * 440 * i / sampleRate))
    view.setInt16(44 + i * 2, sample, true)
  }

  return buffer
}

// Register + login once per VU
export function setup() {
  const email = `loadtest_${Date.now()}_${Math.random().toString(36).slice(2)}@rain.test`
  const password = 'LoadTest!2026secure'

  const regRes = http.post(`${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  )

  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  )

  return {
    token: loginRes.json('access_token') || '',
    wavData: generateTestWav(),
  }
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  }

  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health`, { headers })
  check(healthRes, { 'health 200': (r) => r.status === 200 })

  // 2. Upload audio file
  const uploadStart = Date.now()
  const uploadRes = http.post(`${BASE_URL}/api/v1/master/upload`, data.wavData, {
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'audio/wav',
    },
  })

  const uploadOk = check(uploadRes, {
    'upload 200': (r) => r.status === 200,
    'upload has session_id': (r) => {
      try { return !!r.json('session_id') } catch { return false }
    },
  })

  if (!uploadOk) {
    uploadErrors.add(1)
    sleep(2)
    return
  }

  const sessionId = uploadRes.json('session_id')

  // 3. Poll for analysis completion
  let analysisReady = false
  for (let i = 0; i < 10; i++) {
    const statusRes = http.get(`${BASE_URL}/api/v1/master/${sessionId}/analysis`, { headers })
    if (statusRes.status === 200) {
      analysisReady = true
      break
    }
    sleep(1)
  }

  check(null, { 'analysis completed': () => analysisReady })

  // 4. Trigger mastering process
  if (analysisReady) {
    const processRes = http.post(
      `${BASE_URL}/api/v1/master/${sessionId}/process`,
      JSON.stringify({ platform: 'spotify' }),
      { headers }
    )

    const processOk = check(processRes, {
      'process accepted': (r) => r.status === 200 || r.status === 202,
    })

    if (!processOk) {
      masteringErrors.add(1)
    }

    // 5. Poll for completion (up to 30s)
    let complete = false
    for (let i = 0; i < 30; i++) {
      const statusRes = http.get(`${BASE_URL}/api/v1/master/${sessionId}/analysis`, { headers })
      if (statusRes.status === 200) {
        try {
          const status = statusRes.json('status')
          if (status === 'complete') {
            complete = true
            masteringDuration.add(Date.now() - uploadStart)
            break
          }
          if (status === 'failed') {
            masteringErrors.add(1)
            break
          }
        } catch { /* continue polling */ }
      }
      sleep(1)
    }

    check(null, { 'mastering completed': () => complete })
  }

  // 6. QC check
  if (sessionId) {
    const qcRes = http.get(`${BASE_URL}/api/v1/qc/platforms`, { headers })
    check(qcRes, { 'qc platforms 200': (r) => r.status === 200 })
  }

  sleep(2)
}
