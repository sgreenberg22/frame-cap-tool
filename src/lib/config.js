// Central limits and defaults. Keep tunables here, not scattered through components.
export const LIMITS = {
  batchMaxCount: 500,
  batchMinIntervalMs: 16,
  batchMaxIntervalMs: 600000,
  speedMin: 0.05,
  speedMax: 16,
  gifMaxFrames: 600,
  gifMaxWidth: 1920,
  gifMinWidth: 32,
  gifMaxFps: 50,
  gifMemoryWarnBytes: 400 * 1024 * 1024,
  editorMaxHistory: 60,
  thumbWidth: 320,
  waveformMaxBytes: 300 * 1024 * 1024,
  animatedImportMaxFrames: 300,
  seekTimeoutMs: 4000,
}

export const DEFAULT_FPS = 30

export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2]

export const DEFAULT_SETTINGS = {
  theme: 'system', // system | creamsicle | midnight | contrast
  lang: 'en',
  imageFormat: 'image/png',
  imageQuality: 0.92,
  captureScale: 'native', // native | display | custom
  captureCustomScale: 1,
  bakeFilters: true,
  nameTemplate: '{video}_{index}_{timecode}',
  burnTimestamp: false,
  burnPosition: 'bottom-right',
  burnSize: 24,
  burnColor: '#ffffff',
  watermarkText: '',
  watermarkOpacity: 0.5,
  watermarkPosition: 'bottom-left',
  watermarkImage: '',
  watermarkImageScale: 0.18,
  shutterSound: false,
  flash: true,
  haptics: true,
  timeUnit: 'seconds', // seconds | frames
  preservePitch: true,
  tourDone: false,
  errorLog: false,
}

export const GIF_SIZE_PRESETS = [
  { id: 'original', label: 'Source width', width: null },
  { id: 'slack', label: 'Slack (480px)', width: 480 },
  { id: 'discord', label: 'Discord (498px)', width: 498 },
  { id: 'x', label: 'X / Twitter (506px)', width: 506 },
  { id: 'giphy', label: 'Giphy (480px)', width: 480 },
  { id: 'small', label: 'Small (320px)', width: 320 },
  { id: 'hd', label: 'HD (1280px)', width: 1280 },
]

export const GIF_QUALITY_PRESETS = {
  chat: { label: 'Small for chat', width: 480, fps: 10, colors: 128, dither: 'none', globalPalette: true, optimize: true },
  hq: { label: 'High quality', width: 960, fps: 20, colors: 256, dither: 'floyd', globalPalette: false, optimize: false },
  tiny: { label: 'Tiny preview', width: 240, fps: 8, colors: 64, dither: 'ordered', globalPalette: true, optimize: true },
}
