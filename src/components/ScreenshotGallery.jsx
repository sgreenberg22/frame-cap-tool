import React from 'react'


export default function ScreenshotGallery({ shots, onEdit, onDownload }){
return (
<div>
<h3>Screenshots ({shots.length})</h3>
<div className="gallery">
{shots.map((s,i)=> (
<figure key={i}>
<img src={s.data} alt={`shot-${i}`} />
<figcaption className="stat">t={s.time.toFixed(2)}s · <button className="btn secondary" onClick={()=>onEdit(i)}>Edit</button> <button className="btn secondary" onClick={()=>onDownload(i)}>Download</button></figcaption>
</figure>
))}
</div>
</div>
)
}
