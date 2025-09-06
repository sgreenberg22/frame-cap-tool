import React from 'react'


export default function CaptureControls({ onFile, speed, setSpeed, playing, onPlayPause, onSingleShot, onBatch, disable }){
return (
<div className="controls">
<input type="file" accept="video/*" onChange={e=>onFile(e.target.files?.[0]||null)} />
<button className="btn" onClick={onPlayPause} disabled={disable}>{playing? 'Pause' : 'Play'}</button>
<label className="stat">Speed: {speed.toFixed(2)}x</label>
<input type="range" min="0.1" max="3" step="0.05" value={speed} onChange={e=>setSpeed(parseFloat(e.target.value))} />
<button className="btn secondary" onClick={onSingleShot} disabled={disable}>Screenshot</button>
<button className="btn secondary" onClick={onBatch} disabled={disable}>Batch…</button>
</div>
)
}
