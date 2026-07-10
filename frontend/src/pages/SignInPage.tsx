import { SignIn } from '@clerk/react'
import { Link } from 'react-router-dom'
import AmbientCanvas from '../components/AmbientCanvas'
import './AuthPage.css'

const APPEARANCE = {
  variables: {
    colorPrimary: '#f0a83d',
    colorBackground: 'transparent',
    colorText: '#edeae2',
    colorTextSecondary: '#8b8d91',
    colorInputBackground: 'rgba(16, 17, 19, 0.55)',
    colorInputText: '#edeae2',
    borderRadius: '12px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    // The outer .auth-card already supplies the glass surface -- strip
    // Clerk's own card chrome so the two don't stack into a card-in-a-card.
    rootBox: { width: '100%' },
    card: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      border: 'none',
      padding: 0,
      width: '100%',
    },
  },
}

export default function SignInPage() {
  return (
    <div className="auth-page">
      <AmbientCanvas />
      <Link to="/" className="auth-page-brand">
        Voice Clone Studio
      </Link>
      <div className="panel auth-card">
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/studio"
          appearance={APPEARANCE}
        />
      </div>
    </div>
  )
}
