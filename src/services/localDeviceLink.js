const LOCAL_DEVICE_URL = 'http://divyadrishti.local:8765'

async function request(path, pairingCode, options = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2_500)

  try {
    const response = await fetch(`${LOCAL_DEVICE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Divya-Pairing-Code': pairingCode,
        ...options.headers,
      },
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
    body: JSON.stringify({ command }),
  })
}
