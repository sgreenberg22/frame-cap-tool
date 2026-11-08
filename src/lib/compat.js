import { supportsWebGL2 } from './gl'
import { supportsCtxFilter } from './filters'

export function compatReport() {
  const has = (x) => {
    try {
      return !!x()
    } catch {
      return false
    }
  }
  return [
    { id: 'webgl2', label: 'WebGL2 (live GPU filters)', ok: supportsWebGL2(), fallback: 'Filters fall back to CSS preview and CPU processing.' },
    { id: 'ctxfilter', label: 'Canvas filters', ok: supportsCtxFilter(), fallback: 'Handled by the GPU or CPU pipeline instead.', quiet: true },
    {
      id: 'rvfc',
      label: 'Frame-accurate playback callbacks',
      ok: has(() => 'requestVideoFrameCallback' in HTMLVideoElement.prototype),
      fallback: 'Frame stepping and FPS detection are approximate.',
    },
    { id: 'idb', label: 'IndexedDB (saving frames)', ok: has(() => window.indexedDB), fallback: 'Frames are kept only until you close the tab.' },
    { id: 'workers', label: 'Module workers (background GIF encoding)', ok: has(() => window.Worker), fallback: 'GIF export is unavailable.' },
    {
      id: 'recorder',
      label: 'MediaRecorder (video export)',
      ok: has(() => window.MediaRecorder && HTMLCanvasElement.prototype.captureStream),
      fallback: 'Video export and the sample clip are hidden.',
    },
    {
      id: 'webcodecs',
      label: 'ImageDecoder (animated GIF/WebP import)',
      ok: has(() => window.ImageDecoder),
      fallback: 'Animated images import as a single frame.',
    },
    {
      id: 'clipboard',
      label: 'Clipboard images',
      ok: has(() => navigator.clipboard?.write && window.ClipboardItem),
      fallback: 'Use Download instead of Copy.',
    },
    {
      id: 'fsa',
      label: 'File System Access (reopen recent files)',
      ok: has(() => window.showOpenFilePicker),
      fallback: 'Recent files are listed by name only.',
      quiet: true,
    },
  ]
}
