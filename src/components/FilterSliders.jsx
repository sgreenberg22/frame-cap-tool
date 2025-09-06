import React from 'react'
export default function FilterSliders({ filters, setFilters }){
const fields = [
['brightness',50,200,1,'%'],
['contrast',50,200,1,'%'],
['saturate',0,300,1,'%'],
['hue',0,360,1,'deg'],
]
return (
<div className="controls" style={{marginTop:8}}>
{fields.map(([k,min,max,step,unit])=> (
<label key={k} className="stat">{k}: {filters[k]}{unit}<br/>
<input type="range" min={min} max={max} step={step}
value={filters[k]}
onChange={e=>setFilters(prev=>({...prev,[k]:parseInt(e.target.value,10)}))} />
</label>
))}
<button className="btn secondary" onClick={()=>setFilters({brightness:100,contrast:100,saturate:100,hue:0})}>Reset</button>
</div>
)
}
