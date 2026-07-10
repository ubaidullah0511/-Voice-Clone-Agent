import type { ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return <div className="route-loading">Loading...</div>
  }
  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />
  }
  return <>{children}</>
}
