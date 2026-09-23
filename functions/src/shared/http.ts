import type { HttpRequest, HttpResponseInit } from '@azure/functions'

export function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
    },
  }
}

export function options(): HttpResponseInit {
  return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' } }
}

export async function body<T>(request: HttpRequest): Promise<T> {
  return await request.json() as T
}
