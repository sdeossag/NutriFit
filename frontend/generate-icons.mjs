import sharp from 'sharp'
import { copyFileSync } from 'fs'

const src = 'public/bruce-face.png'

await sharp(src).resize(192, 192).toFile('public/pwa-192x192.png')
await sharp(src).resize(512, 512).toFile('public/pwa-512x512.png')
await sharp(src).resize(180, 180).toFile('public/apple-touch-icon.png')

console.log('Íconos generados correctamente')