import axios from 'axios'

export const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
})

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function apiErrorMessage(error: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (isRecord(data) && typeof data.message === 'string' && data.message.trim()) {
      return data.message
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

export async function getExampleData<T>(url: string): Promise<T> {
  const response = await request.get<ApiResponse<T>>(url)
  return response.data.data
}
