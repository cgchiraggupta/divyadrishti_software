import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, isDemoMode } from '../lib/supabaseClient'
import { createDemoEvent, demoDevice, demoEvents, demoStatus, sceneSpeakText } from '../lib/demoData'
import { signalGuidance, speakGuidance } from '../services/sensoryFeedback'
import { getNearbyDeviceStatus, sendNearbyCommand, sendNearbyDescribe, clearNearbyDeviceUrlCache } from '../services/localDeviceLink'
import { loadObstacleHistory, saveObstacleHistoryItem } from '../services/obstacleHistory'

const DeviceContext = createContext(undefined)
const PAIRING_CODE_KEY = 'divya-drishti-pairing-code'
const LAST_PHONE_ALERT_KEY = 'divyadrishti-last-phone-alert-id'

export function DeviceProvider({ children }) {
  const [device, setDevice] = useState(null)
  const [status, setStatus] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [nearbyLink, setNearbyLink] = useState({ state: 'idle', status: null })
  const [dataError, setDataError] = useState(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [obstacleHistory, setObstacleHistory] = useState(() => loadObstacleHistory())
  const speakingAlertRef = useRef(false)

  const loadDevice = useCallback(async ({ background = false } = {}) => {
    if (isDemoMode) {
      setDevice(demoDevice)
      setStatus(demoStatus)
      setEvents(demoEvents)
      setDataError(null)
      setLastRefreshedAt(new Date().toISOString())
      setLoading(false)
      return
    }

    const pairingCode = window.localStorage.getItem(PAIRING_CODE_KEY)
    if (!pairingCode) {
      setDevice(null)
      setStatus(null)
      setEvents([])
      setDataError(null)
      setLoading(false)
      return
    }
    // Never flip global loading on background polls — that remounts pages
    // (History tabs reset to Obstacles, full-screen flicker every ~15s).
    if (!background) setLoading(true)

    try {
      const { data: activeDevice, error: deviceError } = await supabase
        .from('devices')
        .select('*')
        .eq('pairing_code', pairingCode)
        .maybeSingle()

      if (deviceError) throw deviceError
      setDevice(activeDevice ?? null)

      if (!activeDevice) {
        setStatus(null)
        setEvents([])
        setDataError('This paired device could not be found. Pair it again to reconnect.')
        return
      }

      const [{ data: statusRow, error: statusError }, { data: eventRows, error: eventsError }] = await Promise.all([
        supabase.from('device_status').select('*').eq('device_id', activeDevice.id).maybeSingle(),
        supabase
          .from('device_events')
          .select('*')
          .eq('device_id', activeDevice.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      if (statusError) throw statusError
      if (eventsError) throw eventsError

      setStatus(statusRow ?? null)
      setEvents(eventRows ?? [])
      setDataError(null)
      setLastRefreshedAt(new Date().toISOString())
    } catch {
      setDataError('The app could not refresh device information. Showing the last known status.')
    } finally {
      if (!background) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevice()
  }, [loadDevice])

  // Re-check the source of truth even if a Realtime subscription drops.
  useEffect(() => {
    if (isDemoMode || !device) return undefined
    const interval = window.setInterval(() => loadDevice({ background: true }), 15_000)
    return () => window.clearInterval(interval)
  }, [device, loadDevice])

  const playPreviewScene = useCallback((scene) => {
    if (!isDemoMode) return
    const event = createDemoEvent(scene)
    setDevice((current) => ({ ...(current ?? demoDevice), last_seen_at: event.created_at }))
    setStatus((current) => ({
      ...(current ?? demoStatus),
      current_alert: scene.event_type,
      mode: scene.id === 'ground' ? 'camera_fallback' : 'tof',
      updated_at: event.created_at,
    }))
    setEvents((current) => [event, ...current].slice(0, 200))
    signalGuidance({
      text: sceneSpeakText(scene),
      isHazard: scene.event_type !== 'path_clear',
    })
  }, [])

  // Live updates: device_status changes + new device_events rows
  useEffect(() => {
    if (isDemoMode || !device) return undefined

    const channel = supabase
      .channel(`device-${device.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_status', filter: `device_id=eq.${device.id}` },
        (payload) => setStatus(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_events', filter: `device_id=eq.${device.id}` },
        (payload) => setEvents((prev) => [payload.new, ...prev].slice(0, 200))
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [device])

  // Prefer a nearby Wi-Fi link for immediate connection feedback. Cloud
  // Realtime remains the history and away-from-home fallback.
  // Poll often enough to pick up Gemini phone_alert payloads after obstacles.
  useEffect(() => {
    const nearbyPairingCode = isDemoMode
      ? import.meta.env.VITE_LOCAL_PAIRING_CODE
      : device?.pairing_code

    if (!nearbyPairingCode) {
      setNearbyLink({ state: 'idle', status: null })
      return undefined
    }

    let active = true
    const handlePhoneAlert = async (alert) => {
      if (!alert?.alert_id) return
      const processedKey = 'divyadrishti-processed-alert-ids'
      let processed = []
      try {
        processed = JSON.parse(window.localStorage.getItem(processedKey) || '[]')
      } catch {
        processed = []
      }
      if (!Array.isArray(processed)) processed = []
      if (processed.includes(Number(alert.alert_id))) return
      processed = [...processed, Number(alert.alert_id)].slice(-80)
      window.localStorage.setItem(processedKey, JSON.stringify(processed))
      window.localStorage.setItem(LAST_PHONE_ALERT_KEY, String(alert.alert_id))

      const isDescribe = alert.kind === 'describe' || alert.kind === 'read'
      const isSnapshotOnly = alert.kind === 'obstacle_snapshot' || alert.speak === false
      const speakText = alert.speak_hi || alert.text_hi || ''
      const historyId = alert.replaces_alert_id
        ? `alert-${alert.replaces_alert_id}`
        : `alert-${alert.alert_id}`

      const history = saveObstacleHistoryItem({
        id: historyId,
        created_at: alert.created_at || new Date().toISOString(),
        event_type: alert.event_type || (isDescribe ? 'voice_command' : 'obstacle_ahead'),
        direction: alert.direction,
        distance_mm: alert.distance_mm,
        speak_hi: speakText,
        image_jpeg_b64: alert.image_jpeg_b64,
        source: alert.source || alert.kind,
      })
      setObstacleHistory(history)

      if (isDescribe || isSnapshotOnly || !speakText) return
      if (speakingAlertRef.current) return
      speakingAlertRef.current = true
      try {
        await speakGuidance(speakText)
        if (device?.pairing_code) {
          await sendNearbyCommand(device.pairing_code, 'unmute_haptics').catch(() => {})
        }
      } finally {
        speakingAlertRef.current = false
      }
    }

    const checkNearby = async () => {
      try {
        const localStatus = await getNearbyDeviceStatus(nearbyPairingCode)
        if (!active) return
        setNearbyLink({ state: 'connected', status: localStatus })
        const alerts = Array.isArray(localStatus?.phone_alerts) && localStatus.phone_alerts.length
          ? localStatus.phone_alerts
          : (localStatus?.phone_alert ? [localStatus.phone_alert] : [])
        for (const alert of alerts) {
          await handlePhoneAlert(alert)
        }
      } catch {
        clearNearbyDeviceUrlCache()
        if (active) setNearbyLink({ state: 'away', status: null })
      }
    }
    checkNearby()
    const interval = window.setInterval(checkNearby, 1_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [device])

  const pairDevice = async (pairingCode) => {
    if (isDemoMode) {
      window.localStorage.setItem(PAIRING_CODE_KEY, pairingCode || 'DEMO01')
      return { ...demoDevice, pairing_code: pairingCode || 'DEMO01' }
    }

    const { data, error } = await supabase
      .rpc('claim_device_public', { pairing_code_input: pairingCode })
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('That pairing code was not found or is already linked to a device.')

    window.localStorage.setItem(PAIRING_CODE_KEY, pairingCode)
    await loadDevice()
    return data
  }

  const sendNearbyDeviceCommand = async (command) => {
    if (!device?.pairing_code) throw new Error('Pair your glasses before sending a nearby command.')
    const localStatus = await sendNearbyCommand(device.pairing_code, command)
    setNearbyLink({ state: 'connected', status: localStatus })
    return localStatus
  }

  const describeNearbySurroundings = async () => {
    if (!device?.pairing_code) throw new Error('Pair your glasses before asking them to read.')
    const result = await sendNearbyDescribe(device.pairing_code)
    setNearbyLink((prev) => ({ ...prev, state: 'connected' }))
    if (result?.status === 'ok' && result?.text_hi) {
      const history = saveObstacleHistoryItem({
        id: `read-${Date.now()}`,
        event_type: 'voice_command',
        speak_hi: result.text_hi,
        image_jpeg_b64: result.image_jpeg_b64,
        source: result.source || 'read',
      })
      setObstacleHistory(history)
    }
    return result
  }

  const value = {
    device, status, events, loading, nearbyLink, dataError, lastRefreshedAt, obstacleHistory,
    pairDevice, playPreviewScene, sendNearbyDeviceCommand, describeNearbySurroundings, refresh: loadDevice,
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  const ctx = useContext(DeviceContext)
  if (ctx === undefined) throw new Error('useDevice must be used within DeviceProvider')
  return ctx
}
