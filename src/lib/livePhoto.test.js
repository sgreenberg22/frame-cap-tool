import { describe, expect, it } from 'vitest'
import { groupPhotoFiles } from './livePhoto'

const f = (name, type = '') => ({ name, type })

describe('groupPhotoFiles', () => {
  it('pairs a HEIC still with its MOV by base name', () => {
    const g = groupPhotoFiles([f('IMG_1.HEIC'), f('img_1.mov', 'video/quicktime'), f('b.jpg', 'image/jpeg')])
    expect(g.photos).toHaveLength(2)
    expect(g.photos[0].motion?.name).toBe('img_1.mov')
    expect(g.photos[1].motion).toBeNull()
    expect(g.motionOnly).toHaveLength(0)
  })
  it('keeps unpaired videos and skips other files', () => {
    const g = groupPhotoFiles([f('clip.mp4', 'video/mp4'), f('notes.txt', 'text/plain')])
    expect(g.photos).toHaveLength(0)
    expect(g.motionOnly).toHaveLength(1)
    expect(g.skipped).toHaveLength(1)
  })
})
