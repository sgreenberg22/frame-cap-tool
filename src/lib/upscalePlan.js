// Turns "what the user wants" (content type, method, target size) into a list of enhance ops.
// Pure and testable; enhanceClient runs the ops.

export const MAX_OUTPUT_PIXELS = 40_000_000

export const CONTENT_TYPES = {
  photo: {
    label: 'Photo or video frame',
    hint: 'Natural images. Gentle detail boost after enlarging.',
    pre: [],
    post: [{ op: 'sharpen', strength: 0.35, radius: 1.0 }],
    casSmart: 0.45,
    aiOk: true,
  },
  ui: {
    label: 'Screenshot, text or UI',
    hint: 'Keeps edges and text crisp. Smart mode recommended; AI can smear small text.',
    pre: [],
    post: [],
    casSmart: 0.75,
    aiOk: false,
  },
  noisy: {
    label: 'Old, noisy or compressed',
    hint: 'Cleans noise and blockiness first, so they are not enlarged with the picture.',
    pre: [{ op: 'denoise', strength: 0.9 }],
    post: [{ op: 'sharpen', strength: 0.4, radius: 1.2 }],
    casSmart: 0.4,
    aiOk: true,
  },
}

export const TARGETS = [
  { id: 'x2', label: '2×', scale: 2 },
  { id: 'x3', label: '3×', scale: 3 },
  { id: 'x4', label: '4×', scale: 4 },
  { id: 'fit1080', label: 'Fit 1080p', long: 1920 },
  { id: 'fit1440', label: 'Fit 1440p', long: 2560 },
  { id: 'fit4k', label: 'Fit 4K', long: 3840 },
]

/** Output size for a target. Fit targets scale the long side to `long`; returns null if that would shrink the image. */
export function targetSize(width, height, target) {
  if (target.scale) return { w: Math.round(width * target.scale), h: Math.round(height * target.scale) }
  const s = target.long / Math.max(width, height)
  if (s <= 1.001) return null
  return { w: Math.round(width * s), h: Math.round(height * s) }
}

/**
 * Plan the ops for an upscale.
 * Returns { ops, outW, outH, steps, warnings, error } where `steps` is a short human-readable chain.
 */
export function planUpscale({ width, height, method = 'smart', content = 'photo', target = TARGETS[0] }) {
  const cfg = CONTENT_TYPES[content] || CONTENT_TYPES.photo
  const size = targetSize(width, height, target)
  if (!size) return { error: `This image is already at least ${target.long}px on its long side.`, ops: [], steps: [], warnings: [] }
  if (size.w * size.h > MAX_OUTPUT_PIXELS)
    return {
      error: `The result would be ${((size.w * size.h) / 1e6).toFixed(0)} megapixels. The limit is ${MAX_OUTPUT_PIXELS / 1e6}. Pick a smaller target or crop first.`,
      ops: [],
      steps: [],
      warnings: [],
    }
  const warnings = []
  const ops = []
  const steps = []
  for (const p of cfg.pre) {
    ops.push(p)
    steps.push(p.op === 'denoise' ? 'Denoise' : p.op)
  }
  const factor = size.w / width
  if (method === 'ai') {
    if (!cfg.aiOk) warnings.push('AI upscaling can smear small text and sharp UI edges. Smart is usually better for this kind of image.')
    const aiScale = factor <= 2.001 ? 2 : 4
    ops.push({ op: 'aiUpscale', scale: aiScale })
    steps.push(`AI ${aiScale}×`)
    const aiW = width * aiScale
    if (Math.abs(aiW - size.w) > 1) {
      ops.push({ op: 'resize', width: size.w, height: size.h })
      steps.push(`Resize to ${size.w}×${size.h}`)
    }
    if (factor > 4.001) warnings.push('Beyond 4× the AI model is stretched by a normal resize, so extra detail will be limited.')
  } else {
    ops.push({ op: 'resize', width: size.w, height: size.h })
    steps.push(`Lanczos to ${size.w}×${size.h}`)
    if (cfg.casSmart > 0) {
      ops.push({ op: 'cas', sharpness: cfg.casSmart })
      steps.push('Adaptive sharpen')
    }
  }
  for (const p of cfg.post) {
    ops.push(p)
    steps.push(p.op === 'sharpen' ? 'Sharpen' : p.op)
  }
  if (factor < 1.05) warnings.push('The size barely changes, so this mostly acts as a clean-up.')
  return { ops, outW: size.w, outH: size.h, steps, warnings, error: null }
}

/** Largest centered crop (<= side px) used for a quick before/after preview. */
export function previewCrop(width, height, side = 160) {
  const w = Math.min(side, width)
  const h = Math.min(side, height)
  return { x: Math.max(0, Math.round((width - w) / 2)), y: Math.max(0, Math.round((height - h) / 2)), w, h }
}
