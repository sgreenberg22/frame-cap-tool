import { useEffect, useState } from 'react'

/** Subscribe to a media element's current time, updated every frame while playing. */
export default function useMediaTime(videoRef, deps = []) {
  const [time, setTime] = useState(0)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf = 0
    const tick = () => {
      setTime(v.currentTime)
      if (!v.paused) raf = requestAnimationFrame(tick)
    }
    const onUpdate = () => setTime(v.currentTime)
    const onPlay = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('seeked', onUpdate)
    v.addEventListener('seeking', onUpdate)
    v.addEventListener('timeupdate', onUpdate)
    v.addEventListener('loadedmetadata', onUpdate)
    if (!v.paused) onPlay()
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('seeked', onUpdate)
      v.removeEventListener('seeking', onUpdate)
      v.removeEventListener('timeupdate', onUpdate)
      v.removeEventListener('loadedmetadata', onUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return time
}
