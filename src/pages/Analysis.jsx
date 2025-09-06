import React, { useEffect, useMemo, useRef, useState } from 'react'
import CaptureControls from '../components/CaptureControls'
import FilterSliders from '../components/FilterSliders'
import ScreenshotGallery from '../components/ScreenshotGallery'
import EditorModal from '../components/EditorModal'

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
    v.pause()
    setPlaying(false)
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
          <h2>Video</h2>
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
          <FilterSliders filters={filters} setFilters={setFilters} />
          <div className="stat" style={{marginTop:8}}>Batch: count <input type="number" min="1" max="200" value={batchCfg.count} onChange={e=>setBatchCfg(c=>({...c,count:parseInt(e.target.value||'0',10)}))}/> / interval (ms) <input type="number" min="16" step="10" value={batchCfg.intervalMs} onChange={e=>setBatchCfg(c=>({...c,intervalMs:parseInt(e.target.value||'0',10)}))}/></div>
          <div className="canvasWrap" style={{marginTop:12}}>
            {src ? (
              <video ref={videoRef} src={src} style={{width:'100%',display:'block',filter:filterCss}} controls onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} />
            ) : (
              <div style={{padding:20,color:'var(--muted)'}}>Upload a video to begin.</div>
            )}
          </div>
          <canvas ref={canvasRef} style={{display:'none'}} />
        </div>
        <div className="card">
          <ScreenshotGallery shots={shots} onEdit={openEditor} onDownload={downloadIndex} />
        </div>
      </section>

      <EditorModal
        open={editor.open}
        image={editor.index>-1 ? shots[editor.index]?.data : ''}
        onClose={closeEditor}
        onSave={saveEditor}
      />
    </div>
  )
}
