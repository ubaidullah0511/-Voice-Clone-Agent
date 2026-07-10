import { Route, Routes, useNavigate } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import ProtectedRoute from './components/ProtectedRoute'
import StudioShell from './components/StudioShell'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'

export default function App() {
  const navigate = useNavigate()

  return (
    <Routes>
      <Route path="/" element={<LandingPage onEnter={() => navigate('/studio')} />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route
        path="/studio"
        element={
          <ProtectedRoute>
            <StudioShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
