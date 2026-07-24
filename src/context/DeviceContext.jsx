import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const DeviceContext = createContext(undefined)

export function DeviceProvider({ children }) {
  const { user } = useAuth()
  const [device, setDevice] = useState(null)
  const [status, setStatus] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const loadDevice = useCallback(async () => {
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

  // Live updates: device_status changes + new device_events rows
  useEffect(() => {
    if (!device) return

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

  const pairDevice = async (pairingCode) => {
    const { data, error } = await supabase
      .from('devices')
      .update({ owner_id: user.id, paired_at: new Date().toISOString() })
      .eq('pairing_code', pairingCode)
      .is('owner_id', null)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('That pairing code was not found or is already linked to a device.')

    await loadDevice()
    return data
  }

  const value = { device, status, events, loading, pairDevice, refresh: loadDevice }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  const ctx = useContext(DeviceContext)
  if (ctx === undefined) throw new Error('useDevice must be used within DeviceProvider')
  return ctx
}
