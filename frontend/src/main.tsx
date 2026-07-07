import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudioActivityProvider } from './AudioActivityContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioActivityProvider>
      <App />
    </AudioActivityProvider>
  </StrictMode>,
)
