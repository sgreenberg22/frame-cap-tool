import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'


export default function App(){
const loc = useLocation()
return (
<>
<div className="container">
  <Link to="/">Home</Link>
</div>
<Outlet key={loc.pathname} />
<footer className="container" style={{marginTop:24}}>
<small>Built by Stephen G.</small>
</footer>
</>
)
}
