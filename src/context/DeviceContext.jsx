import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, isDemoMode } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'
import { createDemoEvent, demoDevice, demoEvents, demoStatus } from '../lib/demoData'
import { signalGuidance } from '../services/sensoryFeedback'
import { getNearbyDeviceStatus, sendNearbyCommand } from '../services/localDeviceLink'

const DeviceContext = createContext(undefined)

export function DeviceProvider({ children }) {
  const { user } = useAuth()
  const [device, setDevice] = useState(null)
  const [status, setStatus] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [nearbyLink, setNearbyLink] = useState({ state: 'idle', status: null })

  const loadDevice = useCallback(async () => {
    if (isDemoMode) {
      setDevice(demoDevice)
      setStatus(demoStatus)
      setEvents(demoEvents)
      setLoading(false)
      return
    }

    if (!user) {
      setDevice(null)
      setStatus(null)
      setEvents([])
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: devices } = await supabase
      .from('devices')
      .select('*')
      .eq('owner_id', user.id)
      .order('paired_at', { ascending: false })
      .limit(1)

    const activeDevice = devices?.[0] ?? null
    setDevice(activeDevice)

    if (activeDevice) {
      const [{ data: statusRow }, { data: eventRows }] = await Promise.all([
        supabase.from('device_status').select('*').eq('device_id', activeDevice.id).maybeSingle(),
        supabase
          .from('device_events')
          .select('*')
          .eq('device_id', activeDevice.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      setStatus(statusRow ?? null)
      setEvents(eventRows ?? [])
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    loadDevice()
  }, [loadDevice])

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
      text: `${scene.title}. ${scene.message}`,
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
  useEffect(() => {
    if (isDemoMode || !device?.pairing_code) {
      setNearbyLink({ state: 'idle', status: null })
      return undefined
    }

    let active = true
    const checkNearby = async () => {
      try {
        const localStatus = await getNearbyDeviceStatus(device.pairing_code)
        if (active) setNearbyLink({ state: 'connected', status: localStatus })
      } catch {
        if (active) setNearbyLink({ state: 'away', status: null })
      }
    }
    checkNearby()
    const interval = window.setInterval(checkNearby, 8_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [device])

  const pairDevice = async (pairingCode) => {
    if (isDemoMode) {
      if (pairingCode && pairingCode !== 'DEMO01') {
        throw new Error('Use DEMO01 to pair the local demo device.')
      }
      return demoDevice
    }

    const { data, error } = await supabase
      .rpc('claim_device', { pairing_code_input: pairingCode })
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('That pairing code was not found or is already linked to a device.')

    await loadDevice()
    return data
  }

  const sendNearbyDeviceCommand = async (command) => {
    if (!device?.pairing_code) throw new Error('Pair your glasses before sending a nearby command.')
    const localStatus = await sendNearbyCommand(device.pairing_code, command)
    setNearbyLink({ state: 'connected', status: localStatus })
    return localStatus
  }

  const value = {
    device, status, events, loading, nearbyLink, pairDevice, playPreviewScene,
    sendNearbyDeviceCommand, refresh: loadDevice,
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  const ctx = useContext(DeviceContext)
  if (ctx === undefined) throw new Error('useDevice must be used within DeviceProvider')
  return ctx
}
