import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (the Power Apps content policy blocks external font hosts).
// FlowCom defaults, then the other faces an installation may choose (theme/tokens.ts FONT_OPTIONS).
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
