import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'


export default function App(){
const loc = useLocation()
return (
<>
<div className="container">
</div>
<Outlet key={loc.pathname} />
<footer className="container" style={{marginTop:24}}>
<small>Built by Stephen G. <a href="https://buymeacoffee.com/scgreenberg" target="_blank">Buy me a coffee?</a></small>
</footer>
</>
)
}
