/** Image loading helpers for the renderer (browser-only). */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Small JPEG (base64, no data: prefix) for the model to look at. ~30–60 KB. */
export function thumbnailBase64(img: CanvasImageSource & { width: number; height: number }, max = 512): string {
  const w = (img as HTMLImageElement).naturalWidth || img.width
  const h = (img as HTMLImageElement).naturalHeight || img.height
  const scale = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round(h * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8).split(',')[1]
}
