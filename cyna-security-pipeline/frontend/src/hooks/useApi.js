const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * Fetch a JSON endpoint from the Cyna SOC API.
 * @param {string} path - The API path, e.g. '/api/kpis'
 * @param {RequestInit} options - Optional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function fetchApi(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json()
}

/**
 * Build a query string from a filters object, omitting null/undefined/empty values.
 * @param {Record<string, any>} filters
 * @returns {string} Query string starting with '?' or ''
 */
export function buildQueryString(filters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') {
      params.set(key, String(value))
    }
  }
  const str = params.toString()
  return str ? `?${str}` : ''
}
