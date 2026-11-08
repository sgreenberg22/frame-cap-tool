import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error(`[FrameCapture] ${this.props.label || 'component'} crashed`, error, info)
    window.dispatchEvent(new ErrorEvent('error', { error, message: `${this.props.label}: ${error?.message}` }))
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card error-card" role="alert">
        <strong>The {this.props.label || 'section'} hit an error.</strong>
        <p className="muted small">{String(this.state.error?.message || this.state.error)}</p>
        <p className="muted small">Your frames are saved. You can retry this section without reloading.</p>
        <button className="btn sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}
