// base.css must load before any feature CSS so feature rules can override it
import '@/shared/ui/base.css'
import 'lenis/dist/lenis.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/app/App'
import { StoreProvider } from '@/store/store'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
)
