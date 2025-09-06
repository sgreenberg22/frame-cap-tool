import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import App from './App'
import Analysis from './pages/Analysis'
import './styles.css'


createRoot(document.getElementById('root')).render(
<React.StrictMode>
<BrowserRouter>
<Routes>
<Route element={<App />}>
<Route path="/" element={<Home />} />
<Route path="/analysis" element={<Analysis />} />
</Route>
</Routes>
</BrowserRouter>
</React.StrictMode>
)


function Home(){
return (
<div className="container">
<header className="header">
<h1 className="brand">FrameCapture</h1>
<nav className="nav">
<Link to="/analysis">Analysis</Link>
<a href="https://fly.io/docs/" target="_blank" rel="noreferrer">Fly Docs</a>
</nav>
</header>
<section className="card" style={{marginTop:16}}>
<h2>Welcome</h2>
<p>Upload a video, scrub it with speed & filter controls, and capture single or batch screenshots—then edit and download. You can also create GIFs using the screenshots you've edited.</p>
<Link to="/analysis" className="btn">Open Analysis</Link>
</section>
</div>
)
}
