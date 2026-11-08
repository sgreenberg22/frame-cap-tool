import React from 'react'
import Modal from './Modal'
import { SHORTCUTS } from '../lib/shortcuts'

export default function ShortcutsHelp({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} size="lg">
      <div className="shortcut-grid">
        {SHORTCUTS.map(([group, items]) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {items.map(([k, d]) => (
                <React.Fragment key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{d}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
