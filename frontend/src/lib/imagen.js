// Reduce las fotos en el celular antes de subirlas: de varios MB a unos cientos de KB.
// createImageBitmap respeta la orientación EXIF, así la foto no llega de lado,
// y el resultado siempre es JPEG (el servidor no sabe abrir HEIC).

async function dibujarReducida(file, ladoMax) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return canvas
}

// Para la IA: base64 sin el prefijo "data:"
export async function fotoABase64(file, ladoMax) {
  try {
    const canvas = await dibujarReducida(file, ladoMax)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  } catch {
    // Formato que este navegador no sabe abrir (ej. HEIC en Chrome): se manda tal cual
    return new Promise((resolve, reject) => {
      const lector = new FileReader()
      lector.onload  = () => resolve(String(lector.result).split(',')[1])
      lector.onerror = reject
      lector.readAsDataURL(file)
    })
  }
}

// Para subir como archivo (foto de perfil)
export async function fotoAJpeg(file, ladoMax) {
  try {
    const canvas = await dibujarReducida(file, ladoMax)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (blob) return new File([blob], 'foto.jpg', { type: 'image/jpeg' })
  } catch { /* se sube la original */ }
  return file
}
