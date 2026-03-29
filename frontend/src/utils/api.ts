import { useAuthStore } from '@/stores/auth'

const BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:8000/api/v1'

export class APIError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'APIError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isFormData = false,
): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isFormData) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })

  if (!response.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external JSON shape
    const err = await response.json().catch(() => ({}) as any)
    throw new APIError(
      (err.detail?.code as string | undefined) ?? 'UNKNOWN',
      response.status,
      (err.detail?.message as string | undefined) ?? response.statusText,
    )
  }

  return response.json() as Promise<T>
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<{ access_token: string; refresh_token: string; tier: string; user_id: string }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      ),
    login: (email: string, password: string) =>
      request<{ access_token: string; refresh_token: string; tier: string; user_id: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      ),
  },
  sessions: {
    create: (file: File, params: Record<string, unknown>) => {
      const fd = new FormData()
      fd.append('file', file)
      Object.entries(params).forEach(([k, v]) => fd.append(k, String(v)))
      return request<{ id: string; status: string }>('/sessions/', { method: 'POST', body: fd }, true)
    },
    get: (id: string) => request<{ id: string; status: string; output_lufs?: number }>(`/sessions/${id}`),
    download: (id: string) => `/api/v1/sessions/${id}/download`,
  },
}
