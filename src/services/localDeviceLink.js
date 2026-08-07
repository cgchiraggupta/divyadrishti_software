import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'

const LOCAL_DEVICE_URL = 'http://divyadrishti.local:8765'
const LOCAL_DEVICE_CACHE_MS = 30_000
const LocalDeviceDiscovery = registerPlugin('LocalDeviceDiscovery')
let cachedDeviceUrl = null
let cachedAt = 0

async function getLocalDeviceUrl() {
  if (!Capacitor.isNativePlatform()) return LOCAL_DEVICE_URL
  if (cachedDeviceUrl && Date.now() - cachedAt < LOCAL_DEVICE_CACHE_MS) return cachedDeviceUrl

  const { host, port } = await LocalDeviceDiscovery.discover()
  const safeHost = host.includes(':') ? `[${host}]` : host
  cachedDeviceUrl = `http://${safeHost}:${port}`
  cachedAt = Date.now()
  return cachedDeviceUrl
}

async function request(path, pairingCode, options = {}) {
  const headers = {
    'X-Divya-Pairing-Code': pairingCode,
    ...options.headers,
  }
  const url = `${await getLocalDeviceUrl()}${path}`

  // The Android WebView is served from https://localhost and blocks normal
  // browser fetches to the Pi's local HTTP endpoint as mixed content. Native
  // Capacitor HTTP keeps this request on the explicitly paired local network.
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: options.method ?? 'GET',
      headers,
      data: options.body ? JSON.parse(options.body) : undefined,
      connectTimeout: 2_500,
      readTimeout: 2_500,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Nearby glasses returned ${response.status}`)
    }
    return response.data
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2_500)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    })
    if (!response.ok) throw new Error(`Nearby glasses returned ${response.status}`)
    return response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getNearbyDeviceStatus(pairingCode) {
  return request('/v1/status', pairingCode)
}

export function sendNearbyCommand(pairingCode, command) {
  return request('/v1/command', pairingCode, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
}
