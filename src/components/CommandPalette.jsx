import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import { useApp } from '../state/store'
import changelog from '../../CHANGELOG.md?raw'

/** Turn the top of CHANGELOG.md into plain sections for the What's new dialog. */
export function parseChangelog(md, max = 2) {
  const out = []
  for (const block of md.split(/^## /m).slice(1, max + 1)) {
    const [title, ...rest] = block.split('\n')
    const items = rest
      .filter((l) => l.startsWith('- '))
      .map((l) =>
        l
          .slice(2)
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/`(.+?)`/g, '$1'),
      )
    out.push({ title: title.trim(), items })
  }
  return out
}

/** Dispatch a keypress the Studio already understands. */
function press(key, opts = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}

export function buildCommands({ navigate, setSettings, openNews, onStudio }) {
  const nav = (label, to) => ({ id: `nav-${to}`, label: `Go to ${label}`, group: 'Navigate', run: () => navigate(to) })
  const studio = (label, fn, keys) => ({ id: `studio-${label}`, label, group: 'Studio', keys, studio: true, run: fn })
  return [
    nav('Home', '/'),
    nav('Studio', '/studio'),
    nav('Help', '/help'),
    nav('Settings', '/settings'),
    nav('About', '/about'),
    nav('Privacy', '/privacy'),
    studio('Capture frame', () => press('s'), 'S'),
    studio('Play / pause', () => press(' '), 'Space'),
    studio('Run or stop batch capture', () => press('b'), 'B'),
    studio('Add marker', () => press('m'), 'M'),
    studio('Split clip at playhead', () => press('c'), 'C'),
    studio('Toggle fullscreen', () => press('f'), 'F'),
    studio('Set in point', () => press('i'), 'I'),
    studio('Set out point', () => press('o'), 'O'),
    studio('Toggle A-B loop', () => press('a'), 'A'),
    studio('Show Video workspace', () => press('1'), '1'),
    studio('Show Frames workspace', () => press('2'), '2'),
    studio('Show Animate workspace', () => press('3'), '3'),
    studio('Keyboard shortcuts', () => press('?'), '?'),
    ...['creamsicle', 'midnight', 'contrast', 'system'].map((t) => ({
      id: `theme-${t}`,
      label: `Theme: ${t === 'contrast' ? 'high contrast' : t}`,
      group: 'Appearance',
      run: () => setSettings({ theme: t }),
    })),
    { id: 'news', label: "What's new", group: 'Help', run: openNews },
  ].filter((c) => !c.studio || onStudio)
}

/** Fuzzy-ish score: all query words must appear; earlier and tighter matches rank higher. */
export function rank(commands, query, recent = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) {
    const r = (id) => (recent.includes(id) ? recent.indexOf(id) : 99)
    return [...commands].sort((a, b) => r(a.id) - r(b.id))
  }
  return commands
    .map((c) => {
      const hay = `${c.label} ${c.group}`.toLowerCase()
      if (!words.every((w) => hay.includes(w))) return null
      return { c, score: words.reduce((s, w) => s + hay.indexOf(w), 0) }
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c)
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const { setSettings } = useApp()
  const [open, setOpen] = useState(false)
  const [news, setNews] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const listRef = useRef(null)
  const recent = useRef([])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setI(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onStudio = typeof location !== 'undefined' && location.pathname.startsWith('/studio')
  const commands = useMemo(
    () => buildCommands({ navigate, setSettings, openNews: () => setNews(true), onStudio }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, setSettings, open, onStudio],
  )
  const results = useMemo(() => rank(commands, q, recent.current), [commands, q])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [i])

  function run(c) {
    if (!c) return
    recent.current = [c.id, ...recent.current.filter((x) => x !== c.id)].slice(0, 5)
    setOpen(false)
    // Let the dialog close (and release focus) before the action runs.
    setTimeout(c.run, 50)
  }

  return (
    <>
      {open && (
        <Modal title="Command palette" hideTitle onClose={() => setOpen(false)} className="palette">
          <input
            data-autofocus
            className="palette-input"
            placeholder="Type a command…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setI(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((x) => Math.min(results.length - 1, x + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((x) => Math.max(0, x - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(results[i])
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-label="Command"
          />
          <ul id="palette-list" className="palette-list" role="listbox" ref={listRef}>
            {results.length === 0 && <li className="muted">No matching commands</li>}
            {results.map((c, idx) => (
              <li key={c.id} role="option" aria-selected={idx === i} className={idx === i ? 'on' : ''} onMouseMove={() => setI(idx)} onClick={() => run(c)}>
                <span>{c.label}</span>
                <span className="muted small">{c.keys || c.group}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {news && (
        <Modal title="What's new" onClose={() => setNews(false)}>
          {parseChangelog(changelog).map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </Modal>
      )}
    </>
  )
}
