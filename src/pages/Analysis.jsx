import React, { useEffect, useMemo, useRef, useState } from 'react'
import CaptureControls from '../components/CaptureControls'
import FilterSliders from '../components/FilterSliders'
import ScreenshotGallery from '../components/ScreenshotGallery'
import EditorModal from '../components/EditorModal'
import ExportGIF from '../components/ExportGIF'

export default function Analysis(){
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [filters, setFilters] = useState({brightness:100,contrast:100,saturate:100,hue:0})
  const [shots, setShots] = useState([]) // {data, time}
  const [batchCfg, setBatchCfg] = useState({count:5, intervalMs:500})
  const [editor, setEditor] = useState({open:false, index:-1})

  const filterCss = useMemo(()=>`brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) hue-rotate(${filters.hue}deg)`,[filters])

  useEffect(()=>{ const v=videoRef.current; if(v) v.playbackRate = speed },[speed])

  function onFile(file){
    if(!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setShots([])
    setPlaying(false)
  }

  function onPlayPause(){
    const v = videoRef.current; if(!v) return
    if(v.paused){ v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  function capture(){
    const v = videoRef.current, c = canvasRef.current
    if(!v || !c || !v.videoWidth) return
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')
    ctx.filter = filterCss
    ctx.drawImage(v,0,0,c.width,c.height)
    const data = c.toDataURL('image/png')
    setShots(prev=>[{data, time:v.currentTime}, ...prev])
  }

  function seekTo(time){
    return new Promise((resolve,reject)=>{
      const v = videoRef.current; if(!v) return reject(new Error('no video'))
      const handler = ()=>{ v.removeEventListener('seeked', handler); resolve() }
      v.addEventListener('seeked', handler, { once:true })
      v.currentTime = Math.min(Math.max(0,time), v.duration || time)
    })
  }

  async function batch(){
    const v = videoRef.current; if(!v) return
    const wasPlaying = !v.paused
    v.pause(); setPlaying(false)
    const start = v.currentTime
    for(let i=0;i<batchCfg.count;i++){
      const t = start + (i * batchCfg.intervalMs)/1000
      if(v.duration && t>v.duration) break
      await seekTo(t)
      capture()
    }
    if(wasPlaying){ v.play(); setPlaying(true) }
  }

  function downloadIndex(i){
    const s = shots[i]
    const a = document.createElement('a')
    a.href = s.data
    a.download = `screenshot_${i+1}_${s.time.toFixed(2)}s.png`
    a.click()
  }

  function openEditor(i){ setEditor({open:true,index:i}) }
  function closeEditor(){ setEditor({open:false,index:-1}) }
  function saveEditor(newData){ setShots(prev=> prev.map((s,idx)=> idx===editor.index? {...s,data:newData}:s)); closeEditor() }

  return (
    <div className="container">
      <section className="grid">
        <div className="card">
          <details open>
            <summary>Video & Controls</summary>
            <div className="controls" style={{marginTop:10}}>
              <CaptureControls
                onFile={onFile}
                speed={speed}
                setSpeed={setSpeed}
                playing={playing}
                onPlayPause={onPlayPause}
                onSingleShot={capture}
                onBatch={batch}
                disable={!src}
              />
            </div>
            <details style={{marginTop:10}}>
              <summary>Filters</summary>
              <FilterSliders filters={filters} setFilters={setFilters} />
            </details>
            <details style={{marginTop:10}}>
              <summary>Batch capture</summary>
              <div className="stat" style={{marginTop:8}}>count <input aria-label="Batch count" type="number" min="1" max="200" value={batchCfg.count} onChange={e=>setBatchCfg(c=>({...c,count:parseInt(e.target.value||'0',10)}))}/> · interval (ms) <input aria-label="Batch interval" type="number" min="16" step="10" value={batchCfg.intervalMs} onChange={e=>setBatchCfg(c=>({...c,intervalMs:parseInt(e.target.value||'0',10)}))}/></div>
            </details>
            <div className="canvasWrap" style={{marginTop:12}}>
              {src ? (
                <video ref={videoRef} src={src} style={{width:'100%',display:'block',filter:filterCss}} controls onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} />
              ) : (
                <div style={{padding:20,color:'var(--muted)'}}>Upload a video to begin.</div>
              )}
            </div>
            <canvas ref={canvasRef} style={{display:'none'}} />
          </details>
        </div>
        <div className="card">
          <details open>
            <summary>Screenshots</summary>
            <ScreenshotGallery shots={shots} onEdit={openEditor} onDownload={downloadIndex} />
          </details>
        </div>
      </section>

      <section className="card" style={{marginTop:18}}>
        <details open>
          <summary>Export to GIF</summary>
          <ExportGIF videoRef={videoRef} filterCss={filterCss} shots={shots} />
        </details>
      </section>

      {/* Mobile quick action bar */}
      <div className="quickbar only-mobile" aria-label="Quick actions">
        <button className="btn secondary" onClick={onPlayPause} aria-label="Play or pause">{playing? 'Pause' : 'Play'}</button>
        <input aria-label="Speed" type="range" min="0.1" max="3" step="0.05" value={speed} onChange={e=>setSpeed(parseFloat(e.target.value))} />
        <button className="btn secondary" onClick={capture} aria-label="Screenshot" disabled={!src}>Shot</button>
        <button className="btn" onClick={batch} aria-label="Batch" disabled={!src}>Batch</button>
      </div>

      <EditorModal
        open={editor.open}
        image={editor.index>-1 ? shots[editor.index]?.data : ''}
        onClose={closeEditor}
        onSave={saveEditor}
      />
    </div>
  )
}
