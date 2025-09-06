import React, { useEffect, useMemo, useRef, useState } from 'react'
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
onBatch={()=>batch()}
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
