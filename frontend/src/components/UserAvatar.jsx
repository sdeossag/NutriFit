import { useState } from 'react'

const iniciales = (nombre) =>
  nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?'

// Foto de perfil con monograma debajo, como Contactos en iOS: mientras la foto
// carga (o si falla) se ven las iniciales, nunca el ícono de imagen rota.
// La foto aparece con un fundido corto la primera vez; si después cambia, el
// navegador mantiene la anterior hasta tener la nueva, así que no parpadea.
export default function UserAvatar({ src, nombre = '', size = 34, style }) {
  const [lista, setLista] = useState(false)
  const [fallida, setFallida] = useState(null)
  const conFoto = Boolean(src) && fallida !== src

  return (
    <span aria-hidden='true' style={{
      position: 'relative', flexShrink: 0,
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #064e3b, #16a34a)',
      boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.15)',
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38), letterSpacing: '0.01em',
      userSelect: 'none', WebkitUserSelect: 'none',
      ...style,
    }}>
      {iniciales(nombre)}
      {conFoto && (
        <img
          src={src}
          alt=''
          // Las fotos de Google fallan (403) si se envía la página de origen
          referrerPolicy='no-referrer'
          decoding='async'
          draggable={false}
          onLoad={() => setLista(true)}
          onError={() => setFallida(src)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: lista ? 1 : 0, transition: 'opacity 200ms ease',
          }}
        />
      )}
    </span>
  )
}
