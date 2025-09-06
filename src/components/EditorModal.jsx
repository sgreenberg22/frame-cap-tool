import React, { useEffect, useRef, useState } from 'react'

export default function EditorModal({ open, image, onClose, onSave }){
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [size, setSize] = useState(4)
  const [color, setColor] = useState('#22d3ee')
  const [drag, setDrag] = useState(false)
  const [adj, setAdj] = useState({brightness:100,contrast:100})
  const imgObj = useRef(null)

  useEffect(()=>{
    if(!open) return
    const img = new Image()
    img.onload = ()=>{
      imgObj.current = img
      const c = canvasRef.current
      const maxW = Math.min(1000, window.innerWidth-80)
      const scale = Math.min(1, maxW / img.width)
      c.width = img.width * scale
      c.height = img.height * scale
      redraw()
    }
    img.src = image
  },[open, image])

  function filterString(){
    return `brightness(${adj.brightness}%) contrast(${adj.contrast}%)`
  }

  function redraw(){
    const c = canvasRef.current; if(!c || !imgObj.current) return
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height)
    ctx.filter = filterString()
    ctx.drawImage(imgObj.current,0,0,c.width,c.height)
    ctx.filter = 'none'
  }

  function onPointerDown(e){ setDrag(true); stroke(e,true) }
  function onPointerUp(){ setDrag(false) }
  function onPointerMove(e){ if(drag) stroke(e,false) }
  function stroke(e, start){
    const c = canvasRef.current; if(!c) return
    const rect = c.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const ctx = c.getContext('2d')
    if(tool==='pen'){
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap='round';
      if(start){ ctx.beginPath(); ctx.moveTo(x,y) } else { ctx.lineTo(x,y); ctx.stroke() }
    } else if(tool==='erase'){
      ctx.clearRect(x-size/2,y-size/2,size,size)
    }
  }

  function save(){ onSave(canvasRef.current.toDataURL('image/png')) }

  if(!open) return null
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={e=>e.stopPropagation()}>
        <div className="toolbar">
          <button className="btn secondary" onClick={()=>setTool('pen')}>Pen</button>
          <button className="btn secondary" onClick={()=>setTool('erase')}>Erase</button>
          <label>Size <input type="range" min="1" max="32" value={size} onChange={e=>setSize(parseInt(e.target.value))} /></label>
          <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
          <label>Brightness <input type="range" min="50" max="200" value={adj.brightness} onChange={e=>{setAdj(a=>({...a,brightness:parseInt(e.target.value)})); redraw()}} /></label>
          <label>Contrast <input type="range" min="50" max="200" value={adj.contrast} onChange={e=>{setAdj(a=>({...a,contrast:parseInt(e.target.value)})); redraw()}} /></label>
          <button className="btn" onClick={save}>Save</button>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <canvas ref={canvasRef}
          onMouseDown={onPointerDown}
          onMouseUp={onPointerUp}
          onMouseMove={onPointerMove}
          style={{maxWidth:'80vw',maxHeight:'70vh',display:'block'}}
        />
      </div>
    </div>
  )
}
