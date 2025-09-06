import React, { useEffect, useRef, useState } from 'react'

export default function EditorModal({ open, image, onClose, onSave }){
  const baseRef = useRef(null)   // base image canvas
  const inkRef = useRef(null)    // drawing overlay canvas (pen/erase)
  const wrapRef = useRef(null)
  const [tool, setTool] = useState('pen') // 'pen' | 'erase' | 'crop'
  const [size, setSize] = useState(4)
  const [color, setColor] = useState('#ff8a3d')
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
      const base = baseRef.current
      const ink = inkRef.current
      const maxW = Math.min(1100, window.innerWidth-120)
      const scale0 = Math.min(1, maxW / img.width)
      base.width = Math.floor(img.width * scale0)
      base.height = Math.floor(img.height * scale0)
      ink.width = base.width
      ink.height = base.height
      redraw()
      clearInk()
    }
    img.src = image
  },[open, image])

  function filterString(){
    return `brightness(${adj.brightness}%) contrast(${adj.contrast}%)`
  }

  function redraw(){
    const c = baseRef.current; if(!c || !imgObj.current) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0,0,c.width,c.height)
    ctx.filter = filterString()
    const {width:iw, height:ih} = imgObj.current
    ctx.drawImage(imgObj.current, 0,0, iw,ih, 0,0, c.width, c.height)
    ctx.filter = 'none'
  }

  function clearInk(){
    const ink = inkRef.current; if(!ink) return
    const ictx = ink.getContext('2d'); ictx.clearRect(0,0,ink.width,ink.height)
  }

  function localXY(e){
    const target = inkRef.current
    const rect = target.getBoundingClientRect()
    const x = (e.clientX - rect.left + (wrapRef.current?.scrollLeft||0)) / scale
    const y = (e.clientY - rect.top + (wrapRef.current?.scrollTop||0)) / scale
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
    const ink = inkRef.current; if(!ink) return
    const {x,y} = localXY(e)
    const ctx = ink.getContext('2d')
    if(tool==='pen'){
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap='round'; ctx.lineJoin='round'
      if(start){ ctx.beginPath(); ctx.moveTo(x,y) } else { ctx.lineTo(x,y); ctx.stroke() }
    } else if(tool==='erase'){
      ctx.clearRect(x-size/2,y-size/2,size,size)
    }
  }

  function applyCrop(){
    if(!crop) return
    const base = baseRef.current
    const ink = inkRef.current
    const x = Math.round(Math.min(crop.x0, crop.x1))
    const y = Math.round(Math.min(crop.y0, crop.y1))
    const w = Math.max(1, Math.round(Math.abs(crop.x1 - crop.x0)))
    const h = Math.max(1, Math.round(Math.abs(crop.y1 - crop.y0)))

    // Crop base
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    tmp.getContext('2d').drawImage(base, x,y,w,h, 0,0,w,h)
    base.width = w; base.height = h
    base.getContext('2d').drawImage(tmp,0,0)

    // Crop ink overlay
    const inkTmp = document.createElement('canvas')
    inkTmp.width = w; inkTmp.height = h
    inkTmp.getContext('2d').drawImage(ink, x,y,w,h, 0,0,w,h)
    ink.width = w; ink.height = h
    ink.getContext('2d').drawImage(inkTmp,0,0)

    // Update imgObj to the cropped base so brightness/contrast keep working
    const newImg = new Image()
    newImg.onload = ()=>{ imgObj.current = newImg; redraw() }
    newImg.src = base.toDataURL('image/png')
    setCrop(null)
  }

  function save(){
    // Composite base + ink into a single PNG
    const out = document.createElement('canvas')
    const base = baseRef.current, ink = inkRef.current
    out.width = base.width; out.height = base.height
    const octx = out.getContext('2d')
    octx.drawImage(base,0,0)
    octx.drawImage(ink,0,0)
    onSave(out.toDataURL('image/png'))
  }

  if(!open) return null
  let cropStyle = { display:'none' }
  if(crop){
    const sx = wrapRef.current?.scrollLeft || 0
    const sy = wrapRef.current?.scrollTop || 0
    const x = Math.min(crop.x0, crop.x1) * scale - sx
    const y = Math.min(crop.y0, crop.y1) * scale - sy
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
              ref={baseRef}
              style={{display:'block'}}
            />
            <canvas
              ref={inkRef}
              onMouseDown={onPointerDown}
              onMouseUp={onPointerUp}
              onMouseMove={onPointerMove}
              style={{display:'block', position:'absolute', inset:0}}
            />
          </div>
          <div className="cropRect" style={cropStyle}></div>
        </div>
      </div>
    </div>
  )
}
