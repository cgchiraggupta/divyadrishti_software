import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/react'
import { demoUser } from '../lib/demoData'
import { isDemoMode, setSupabaseAccessTokenGetter } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  return isDemoMode ? <DemoAuthProvider>{children}</DemoAuthProvider> : <ClerkAuthProvider>{children}</ClerkAuthProvider>
}

function DemoAuthProvider({ children }) {
  const [session, setSession] = useState({ user: demoUser })

  const value = {
    session,
    user: session?.user ?? null,
    loading: false,
    signIn: () => {
      setSession({ user: demoUser })
      return Promise.resolve()
    },
    signOut: () => {
      setSession(null)
      return Promise.resolve()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function ClerkAuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth()
  const { openSignIn, signOut } = useClerk()
  const { user: clerkUser } = useUser()
  const [connectionTimedOut, setConnectionTimedOut] = useState(false)
  const user = isSignedIn
    ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress ?? null }
    : null

  useEffect(() => {
    setSupabaseAccessTokenGetter(isSignedIn ? () => getToken({ template: 'supabase' }) : null)
    return () => setSupabaseAccessTokenGetter(null)
  }, [getToken, isSignedIn])

  // A misconfigured native auth origin used to leave the whole app on an
  // indefinite loading screen. Give people a clear next step instead.
  useEffect(() => {
    if (isLoaded) {
      setConnectionTimedOut(false)
      return undefined
    }

    const timeoutId = window.setTimeout(() => setConnectionTimedOut(true), 7000)
    return () => window.clearTimeout(timeoutId)
  }, [isLoaded])

  const value = {
    session: user ? { user } : null,
    user,
    loading: !isLoaded && !connectionTimedOut,
    authUnavailable: connectionTimedOut,
    signIn: () => openSignIn(),
    signOut: () => signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
