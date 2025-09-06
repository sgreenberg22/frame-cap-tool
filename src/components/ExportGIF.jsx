import React, { useMemo, useRef, useState } from 'react'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export default function ExportGIF({ videoRef, filterCss, shots }){
  const [mode, setMode] = useState('gallery') // 'gallery' | 'sample'
  const [selected, setSelected] = useState(()=> new Set())
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(3)
  const [fps, setFps] = useState(8)
  const [width, setWidth] = useState(640)
  const [applyFilters, setApplyFilters] = useState(true)
  const [loop, setLoop] = useState(true)
  const [status, setStatus] = useState('')
  const [gifURL, setGifURL] = useState('')
  const busy = useRef(false)

  const chosenShots = useMemo(()=>{
    if(mode!== 'gallery') return []
    const arr = Array.from(selected).sort((a,b)=>a-b)
    return arr.map(i=> shots[i])
  },[selected, shots, mode])

  function toggleSelect(i){
    setSelected(prev=>{ const next = new Set(prev); next.has(i)? next.delete(i): next.add(i); return next })
  }
  function selectAll(){ setSelected(new Set(shots.map((_,i)=>i))) }
  function clearSelection(){ setSelected(new Set()) }

  async function makeFramesFromVideo(){
    const v = videoRef.current
    if(!v || !v.videoWidth) throw new Error('Load a video first')
    const frames = []
    const step = 1/Math.max(1,fps)
    const c = document.createElement('canvas'); const ctx = c.getContext('2d')
    const scale = width / v.videoWidth
    c.width = Math.round(v.videoWidth * scale)
    c.height = Math.round(v.videoHeight * scale)
    const was = v.paused
    v.pause()
    const orig = v.currentTime
    for(let t = start; t <= end + 1e-6; t += step){
      await new Promise((res)=>{ const h=()=>{ v.removeEventListener('seeked',h); res() }; v.addEventListener('seeked',h,{once:true}); v.currentTime = Math.min(Math.max(0,t), v.duration||t) })
      // wait a paint so the current video frame is ready
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
      ctx.clearRect(0,0,c.width,c.height)
      ctx.filter = applyFilters ? filterCss : 'none'
      ctx.drawImage(v,0,0,c.width,c.height)
      frames.push(ctx.getImageData(0,0,c.width,c.height))
    }
    v.currentTime = orig; if(!was) v.play()
    return frames
  }

  async function makeFramesFromShots(){
    const frames = []
    const c = document.createElement('canvas'); const ctx = c.getContext('2d')
    for(const s of chosenShots){
      const img = await loadImage(s.data)
      const scale = width / img.width
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      ctx.clearRect(0,0,c.width,c.height)
      ctx.filter = applyFilters ? filterCss : 'none'
      ctx.drawImage(img,0,0,c.width,c.height)
      frames.push(ctx.getImageData(0,0,c.width,c.height))
    }
    return frames
  }

  async function generate(){
    if(busy.current) return
    busy.current = true; setGifURL(''); setStatus('Preparing frames…')
    try{
      const frames = mode==='gallery' ? await makeFramesFromShots() : await makeFramesFromVideo()
      if(frames.length===0) throw new Error('No frames selected')
      setStatus('Encoding…')
      const enc = GIFEncoder()
      const delay = Math.max(5, Math.round(1000/Math.max(1,fps)))
      const repeat = loop ? 0 : -1
      for(let i=0;i<frames.length;i++){
        setStatus(`Encoding frame ${i+1}/${frames.length}`)
        const rgba = frames[i].data // use RGBA directly for palette quantization
        const pal = quantize(rgba, 256)
        const idx = applyPalette(rgba, pal)
        enc.writeFrame(idx, frames[i].width, frames[i].height, { palette: pal, delay, disposal: 2, ...(i===0 ? { repeat } : {}) })
        await microtask()
      }
      enc.finish()
      const blob = new Blob([enc.bytesView()], { type:'image/gif' })
      const url = URL.createObjectURL(blob)
      setGifURL(url)
      setStatus(`Done • ${frames.length} frames @ ${fps} fps`)
    }catch(err){ setStatus('Error: '+ err.message) }
    finally{ busy.current = false }
  }

  return (
    <div>
      <h2 style={{marginTop:0}}>Export to GIF</h2>
      <div className="kv">
        <label>Source</label>
        <div className="controls">
          <label><input type="radio" name="srcmode" checked={mode==='gallery'} onChange={()=>setMode('gallery')} /> Gallery selection</label>
          <label><input type="radio" name="srcmode" checked={mode==='sample'} onChange={()=>setMode('sample')} /> Sample from video</label>
        </div>
      </div>

      {mode==='gallery' ? (
        <div className="kv">
          <label>Select frames</label>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:8}}>
            <button className="btn secondary" onClick={selectAll}>Select All</button>
            <button className="btn secondary" onClick={clearSelection}>Clear</button>
          </div>
          <div className="gallery">
            {shots.map((s,i)=> (
              <label key={i} style={{cursor:'pointer'}}>
                <input type="checkbox" checked={selected.has(i)} onChange={()=>toggleSelect(i)} />
                <img src={s.data} alt={`shot-${i}`} />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="kv"><label>Start (s)</label><input type="number" min="0" step="0.01" value={start} onChange={e=>setStart(parseFloat(e.target.value||'0'))} /></div>
          <div className="kv"><label>End (s)</label><input type="number" min="0" step="0.01" value={end} onChange={e=>setEnd(parseFloat(e.target.value||'0'))} /></div>
        </>
      )}

      <div className="kv"><label>FPS</label><input type="number" min="1" max="30" value={fps} onChange={e=>setFps(parseInt(e.target.value||'1',10))} /></div>
      <div className="kv"><label>Width (px)</label><input type="number" min="64" max="1920" step="2" value={width} onChange={e=>setWidth(parseInt(e.target.value||'640',10))} /></div>
      <div className="kv"><label>Apply filters</label><input type="checkbox" checked={applyFilters} onChange={e=>setApplyFilters(e.target.checked)} /></div>
      <div className="kv"><label>Loop</label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)} /></div>

      <div className="controls" style={{marginTop:12}}>
        <button className="btn" onClick={generate} disabled={busy.current}>Generate GIF</button>
        <span className="stat">{status}</span>
      </div>

      {gifURL && (
        <div style={{marginTop:12}}>
          <img src={gifURL} alt="gif preview" style={{maxWidth:'100%'}} />
          <div className="controls" style={{marginTop:8}}>
            <a className="btn secondary" href={gifURL} download="export.gif">Download GIF</a>
          </div>
        </div>
      )}
    </div>
  )
}

function loadImage(url){
  return new Promise((resolve,reject)=>{ const i=new Image(); i.onload=()=>resolve(i); i.onerror=reject; i.src=url })
}
function microtask(){ return new Promise(r=>setTimeout(r)) }
