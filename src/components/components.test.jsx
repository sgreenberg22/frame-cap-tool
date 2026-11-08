import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Slider from './Slider'
import Modal from './Modal'
import Gallery from './Gallery'
import { AppProvider } from '../state/store'

describe('Slider', () => {
  function Harness() {
    const [v, setV] = useState(50)
    return <Slider label="Brightness" value={v} min={0} max={100} def={50} onChange={setV} />
  }
  it('clamps typed values and resets on double-click', () => {
    render(<Harness />)
    const num = screen.getByLabelText('Brightness value')
    fireEvent.change(num, { target: { value: '500' } })
    expect(num).toHaveValue(100)
    fireEvent.doubleClick(screen.getByText('Brightness'))
    expect(num).toHaveValue(50)
  })
})

describe('Modal', () => {
  it('is an accessible dialog that closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Hello" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Hello' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Gallery', () => {
  it('shows the empty state with tips', () => {
    render(
      <AppProvider>
        <Gallery selected={new Set()} setSelected={() => {}} onEdit={() => {}} onSeek={() => {}} />
      </AppProvider>,
    )
    expect(screen.getByText(/No frames yet/)).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Selection actions' })).toBeInTheDocument()
  })
})
