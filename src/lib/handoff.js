/** Tiny in-memory hand-off between pages (a File can't go through the router or IndexedDB cheaply). */
let pendingVideo = null
const motionByShot = new Map()

export const setPendingVideo = (file) => {
  pendingVideo = file
}
export const takePendingVideo = () => {
  const f = pendingVideo
  pendingVideo = null
  return f
}
export const rememberMotion = (shotId, file) => motionByShot.set(shotId, file)
export const motionFor = (shotId) => motionByShot.get(shotId) || null
export const forgetMotion = (shotId) => motionByShot.delete(shotId)
