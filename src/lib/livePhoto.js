/**
 * Sorting dropped/picked files for the Photo page.
 * An iPhone Live Photo exports as two files with the same base name: IMG_1234.HEIC (the still)
 * and IMG_1234.MOV (about 3 seconds of motion). We pair them.
 */
const base = (name) => name.replace(/\.[^.]+$/, '').toLowerCase()
const isVideo = (f) => (f.type || '').startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name)
const isImage = (f) => (f.type || '').startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif|hif|tiff?)$/i.test(f.name)

export function groupPhotoFiles(files) {
  const list = [...files]
  const videos = list.filter(isVideo)
  const images = list.filter(isImage)
  const used = new Set()
  const photos = images.map((still) => {
    const motion = videos.find((v) => !used.has(v) && base(v.name) === base(still.name)) || null
    if (motion) used.add(motion)
    return { still, motion }
  })
  return {
    photos,
    motionOnly: videos.filter((v) => !used.has(v)),
    skipped: list.filter((f) => !isImage(f) && !isVideo(f)),
  }
}
