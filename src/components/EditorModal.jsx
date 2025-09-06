import React, { useEffect, useRef, useState } from 'react'

export default function EditorModal({ open, image, onClose, onSave }){
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [tool, setTool] = useState('pen') // 'pen' | 'erase' | 'crop'
  const [size, setSize] = useState(4)
  const [color, setColor] = useState('#22d3ee')
  const [drag, setDrag] = useState(false)
  const [adj, setAdj] = useState({brightness:100,contrast:100})
  const [scale, setScale] = useState(1)
  const [crop, setCrop] = useState(null) // {x0,y0,x1,y1} in canvas coords
  const imgObj = useRef(null)

  useEffect(()=>{
    if(!open) return
    const img = new Image()
    img.onload = ()=>{
      imgObj.current = img
      const c = canvasRef.current
      const maxW = Math.min(1100, window.innerWidth-120)
      const scale0 = Math.min(1, maxW / img.width)
      c.width = Math.floor(img.width * scale0)
      c.height = Math.floor(img.height * scale0)
      redraw()
    }
    img.src = image
  },[open, image])

  function filterString(){
    return `brightness(${adj.brightness}%) contrast(${adj.contrast}%)`
  }

  function redraw(){
    const c = canvasRef.current; if(!c || !imgObj.current) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0,0,c.width,c.height)
    ctx.filter = filterString()
    const {width:iw, height:ih} = imgObj.current
    ctx.drawImage(imgObj.current, 0,0, iw,ih, 0,0, c.width, c.height)
    ctx.filter = 'none'
  }

  function localXY(e){
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    return {x,y}
  }

  function onPointerDown(e){
    if(tool==='crop'){
      const {x,y} = localXY(e)
      setCrop({x0:x,y0:y,x1:x,y1:y})
      return
    }
    setDrag(true); stroke(e,true)
  }
  function onPointerUp(){ setDrag(false) }
  function onPointerMove(e){
    if(tool==='crop'){
      if(!crop) return
      const {x,y} = localXY(e)
      setCrop(prev=>({...prev,x1:x,y1:y}))
      return
    }
    if(drag) stroke(e,false)
  }

  function stroke(e, start){
    const c = canvasRef.current; if(!c) return
    const {x,y} = localXY(e)
    const ctx = c.getContext('2d')
    if(tool==='pen'){
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap='round'
      if(start){ ctx.beginPath(); ctx.moveTo(x,y) } else { ctx.lineTo(x,y); ctx.stroke() }
    } else if(tool==='erase'){
      ctx.clearRect(x-size/2,y-size/2,size,size)
    }
  }

  function applyCrop(){
    if(!crop) return
    const c = canvasRef.current
    const x = Math.round(Math.min(crop.x0, crop.x1))
    const y = Math.round(Math.min(crop.y0, crop.y1))
    const w = Math.max(1, Math.round(Math.abs(crop.x1 - crop.x0)))
    const h = Math.max(1, Math.round(Math.abs(crop.y1 - crop.y0)))
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    const tctx = tmp.getContext('2d')
    tctx.drawImage(c, x,y,w,h, 0,0,w,h)
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(tmp,0,0)
    const newImg = new Image()
    newImg.onload = ()=>{ imgObj.current = newImg; redraw() }
    newImg.src = c.toDataURL('image/png')
    setCrop(null)
  }

  function save(){ onSave(canvasRef.current.toDataURL('image/png')) }

  if(!open) return null
  let cropStyle = { display:'none' }
  if(crop){
    const x = Math.min(crop.x0, crop.x1) * scale
    const y = Math.min(crop.y0, crop.y1) * scale
    const w = Math.abs(crop.x1 - crop.x0) * scale
    const h = Math.abs(crop.y1 - crop.y0) * scale
    cropStyle = { display:'block', left:x, top:y, width:w, height:h }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={e=>e.stopPropagation()}>
        <div className="toolbar">
          <button className="btn secondary" onClick={()=>setTool('pen')}>Pen</button>
          <button className="btn secondary" onClick={()=>setTool('erase')}>Erase</button>
          <button className="btn secondary" onClick={()=>setTool('crop')}>Crop</button>
          <label>Size <input type="range" min="1" max="32" value={size} onChange={e=>setSize(parseInt(e.target.value))} /></label>
          <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
          <label>Brightness <input type="range" min="50" max="200" value={adj.brightness} onChange={e=>{setAdj(a=>({...a,brightness:parseInt(e.target.value)})); redraw()}} /></label>
          <label>Contrast <input type="range" min="50" max="200" value={adj.contrast} onChange={e=>{setAdj(a=>({...a,contrast:parseInt(e.target.value)})); redraw()}} /></label>
          <label>Zoom <input type="range" min="0.5" max="4" step="0.1" value={scale} onChange={e=>setScale(parseFloat(e.target.value))} /></label>
          {tool==='crop' && <>
            <button className="btn" onClick={applyCrop}>Apply Crop</button>
            <button className="btn secondary" onClick={()=>setCrop(null)}>Cancel</button>
          </>}
          <button className="btn" onClick={save}>Save</button>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <div ref={wrapRef} style={{position:'relative', maxWidth:'82vw', maxHeight:'72vh', overflow:'auto'}}>
          <div className="canvasZoom" style={{transform:`scale(${scale})`}}>
            <canvas
              ref={canvasRef}
              onMouseDown={onPointerDown}
              onMouseUp={onPointerUp}
              onMouseMove={onPointerMove}
              style={{display:'block'}}
            />
          </div>
          <div className="cropRect" style={cropStyle}></div>
        </div>
      </div>
    </div>
  )
}
