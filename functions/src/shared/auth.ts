import type { HttpRequest } from '@azure/functions'

type ClientPrincipal = {
  userId?: string
  claims?: Array<{ typ?: string; val?: string }>
}

export function getEntraObjectId(request: HttpRequest): string {
  const direct = request.headers.get('x-ms-client-principal-id')
  if (direct) return direct

  const encoded = request.headers.get('x-ms-client-principal')
  if (encoded) {
    const principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ClientPrincipal
    const oid = principal.claims?.find(claim => claim.typ === 'http://schemas.microsoft.com/identity/claims/objectidentifier' || claim.typ === 'oid')?.val
    if (oid) return oid
    if (principal.userId) return principal.userId
  }

  throw new Error('Authenticated Entra user was not provided by Azure App Service Authentication.')
}
