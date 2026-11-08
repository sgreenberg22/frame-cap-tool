import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main id="main" className="container">
      <section className="card" style={{ marginTop: 24 }}>
        <h1>Page not found</h1>
        <p>That page does not exist. It may have moved.</p>
        <div className="row gap-s">
          <Link className="btn" to="/studio">
            Open the studio
          </Link>
          <Link className="btn secondary" to="/">
            Home
          </Link>
        </div>
      </section>
    </main>
  )
}
