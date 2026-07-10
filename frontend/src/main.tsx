import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/archivo/index.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { AudioActivityProvider } from './AudioActivityContext.tsx'
import { GenerationActivityProvider } from './GenerationActivityContext.tsx'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY -- set it in frontend/.env.local')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <BrowserRouter>
        <AudioActivityProvider>
          <GenerationActivityProvider>
            <App />
          </GenerationActivityProvider>
        </AudioActivityProvider>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)
