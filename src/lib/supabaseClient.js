import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
let accessTokenGetter = null

export function setSupabaseAccessTokenGetter(getter) {
  accessTokenGetter = getter
}

if (!isSupabaseConfigured) {
  console.warn(
    '[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project credentials.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  accessToken: async () => (accessTokenGetter ? accessTokenGetter() : null),
})
