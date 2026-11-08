// Applied before first paint to avoid a theme flash (external file to satisfy the CSP).
try {
  var s = JSON.parse(localStorage.getItem('fc.settings') || '{}').theme || 'system'
  var d = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = s === 'system' ? (d ? 'midnight' : 'creamsicle') : s
} catch {}
