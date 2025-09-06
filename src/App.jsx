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
<small>Built with love in Chicago, IL. By Stephen G.</small>
</footer>
</>
)
}
