/**
 * Look for codec markers in the bytes of an MP4/MOV/MKV file so we can explain
 * why a browser refuses to play it. Pure function: pass in a Uint8Array.
 */
const MARKERS = [
  ['hevc', ['hvc1', 'hev1', 'dvh1', 'dvhe']],
  ['prores', ['apcn', 'apch', 'apcs', 'apco', 'ap4h', 'ap4x']],
  ['av1', ['av01']],
  ['vp9', ['vp09']],
  ['h264', ['avc1', 'avc3']],
  ['mpeg4', ['mp4v']],
  ['wmv', ['WMV1', 'WMV2', 'WVC1']],
]

export function sniffCodecBytes(bytes) {
  const found = new Set()
  const n = bytes.length
  for (let i = 0; i + 4 <= n; i++) {
    const c = bytes[i]
    // Every marker starts with an ASCII letter; skip quickly.
    if (c < 65 || c > 122) continue
    const s = String.fromCharCode(c, bytes[i + 1], bytes[i + 2], bytes[i + 3])
    for (const [name, tags] of MARKERS) if (tags.includes(s)) found.add(name)
  }
  return [...found]
}

/** Read the start and end of a file (where the moov box usually lives) and sniff it. */
export async function sniffCodec(file, chunk = 3 * 1024 * 1024) {
  const read = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(new Uint8Array(r.result))
      r.onerror = () => rej(r.error)
      r.readAsArrayBuffer(blob)
    })
  const head = await read(file.slice(0, chunk))
  const tail = file.size > chunk ? await read(file.slice(Math.max(chunk, file.size - chunk))) : new Uint8Array(0)
  const all = new Uint8Array(head.length + tail.length)
  all.set(head)
  all.set(tail, head.length)
  return sniffCodecBytes(all)
}

/** Plain-language explanation and fix for a video the browser could not decode. */
export function explainDecodeFailure(codecs = [], name = '') {
  const has = (c) => codecs.includes(c)
  if (has('hevc') && !has('h264'))
    return {
      title: 'This video uses HEVC (H.265)',
      body: 'iPhones and many cameras record in HEVC, and this browser cannot play it.',
      steps: [
        'Safari and Chrome on a Mac usually play HEVC. Chrome and Edge on Windows need the free "HEVC Video Extensions" from the Microsoft Store.',
        'On an iPhone, switch Settings → Camera → Formats → Most Compatible so new videos are H.264.',
        'Or convert the file to H.264 MP4 with HandBrake or VLC, then load it again.',
      ],
    }
  if (has('prores') && !has('h264'))
    return {
      title: 'This video uses Apple ProRes',
      body: 'Browsers cannot play ProRes.',
      steps: ['Convert it to H.264 MP4 with HandBrake, Shutter Encoder or ffmpeg, then load it again.'],
    }
  if (has('av1') && !has('h264'))
    return {
      title: 'This video uses AV1',
      body: 'This browser or computer cannot decode AV1.',
      steps: ['Try a recent Chrome, Edge or Firefox, or convert the file to H.264 MP4.'],
    }
  if (/\.(avi|wmv|flv|mpg|mpeg|3gp)$/i.test(name) || has('wmv') || has('mpeg4'))
    return {
      title: 'This file format is not supported',
      body: 'Browsers play MP4 (H.264) and WebM best.',
      steps: ['Convert the file to H.264 MP4 with HandBrake or VLC, then load it again.'],
    }
  return {
    title: 'This video could not be played',
    body: 'The browser could not decode it. It may use a codec this device does not support, or the file may be damaged.',
    steps: ['Try MP4 (H.264 + AAC) or WebM (VP9 + Opus).', 'Try the file in another browser, or convert it with HandBrake.'],
  }
}
