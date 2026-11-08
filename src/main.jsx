import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import { AppProvider } from './state/store'
import './styles.css'

const Studio = lazy(() => import('./pages/Studio'))
const Help = lazy(() => import('./pages/Help'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))
const Privacy = lazy(() => import('./pages/Privacy'))
const NotFound = lazy(() => import('./pages/NotFound'))

const Loading = () => (
  <main id="main" className="container">
    <div className="skeleton" style={{ height: 360, marginTop: 16 }} aria-label="Loading" />
  </main>
)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<App />}>
              <Route path="/" element={<Home />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/analysis" element={<Studio />} />
              <Route path="/help" element={<Help />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

if (import.meta.env.DEV) {
  // Dev-only performance logging (never shipped to production builds)
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) console.debug(`[perf] ${e.entryType} ${e.name || ''} ${Math.round(e.startTime + (e.duration || 0))}ms`)
    }).observe({ entryTypes: ['largest-contentful-paint', 'longtask'] })
  } catch {
    /* unsupported */
  }
}
