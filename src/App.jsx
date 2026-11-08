import React, { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from './state/store'
import { I18nContext, useT } from './lib/i18n'
import Toasts from './components/Toasts'
import CompatBanner from './components/CompatBanner'
import ErrorBoundary from './components/ErrorBoundary'

const THEMES = [
  ['system', 'Auto'],
  ['creamsicle', 'Creamsicle'],
  ['midnight', 'Midnight'],
  ['contrast', 'High contrast'],
]

function applyTheme(theme) {
  const root = document.documentElement
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'system' ? (dark ? 'midnight' : 'creamsicle') : theme
  root.dataset.theme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'midnight' ? '#16130f' : resolved === 'contrast' ? '#000000' : '#FF8A3D')
}

function Header() {
  const t = useT()
  const { settings, setSettings } = useApp()
  const links = [
    ['/', t('nav.home')],
    ['/studio', t('nav.studio')],
    ['/help', t('nav.help')],
    ['/settings', t('nav.settings')],
    ['/about', t('nav.about')],
  ]
  return (
    <header className="site-header">
      <div className="container header-row">
        <NavLink to="/" className="brand" aria-label="FrameCapture home">
          <img src="/favicon.svg" alt="" width="28" height="28" /> FrameCapture
        </NavLink>
        <nav className="nav" aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <label className="theme-pick">
          <span className="sr-only">Theme</span>
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value })} aria-label="Theme">
            {THEMES.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  )
}

export default function App() {
  const { settings } = useApp()
  const loc = useLocation()
  useEffect(() => {
    applyTheme(settings.theme)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = () => applyTheme(settings.theme)
    mq?.addEventListener?.('change', on)
    return () => mq?.removeEventListener?.('change', on)
  }, [settings.theme])
  useEffect(() => {
    document.documentElement.lang = settings.lang
  }, [settings.lang])
  useEffect(() => {
    const titles = {
      '/': 'FrameCapture: frame grabber and GIF maker',
      '/studio': 'Studio · FrameCapture',
      '/help': 'Help · FrameCapture',
      '/settings': 'Settings · FrameCapture',
      '/about': 'About · FrameCapture',
      '/privacy': 'Privacy · FrameCapture',
    }
    document.title = titles[loc.pathname] || 'FrameCapture'
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView()
  }, [loc.pathname, loc.hash])

  return (
    <I18nContext.Provider value={settings.lang}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <CompatBanner />
      <ErrorBoundary label="page">
        <Outlet />
      </ErrorBoundary>
      <footer className="site-footer container">
        <small>
          Built by Stephen G. ·{' '}
          <a href="https://buymeacoffee.com/scgreenberg" target="_blank" rel="noopener noreferrer">
            Buy me a coffee?
          </a>{' '}
          · <NavLink to="/privacy">Privacy</NavLink> ·{' '}
          <a href="https://github.com/sgreenberg22/frame-cap-tool/issues" target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
        </small>
      </footer>
      <Toasts />
    </I18nContext.Provider>
  )
}
