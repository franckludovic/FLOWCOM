import { useState, type ReactNode } from 'react'

// External images (social avatars, Buffer media) can be blocked by the Power
// Apps content security policy or expire upstream. Render `fallback` instead
// of a broken image when the source is missing or fails to load.
export function FallbackImage({ src, alt = '', className, fallback }: {
  src?: string | null
  alt?: string
  className?: string
  fallback: ReactNode
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) return <>{fallback}</>
  return <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />
}
