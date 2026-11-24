import { vi } from 'vitest'

// Replaces fetch with a handler that gets each request's URL and options.
export function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString()
      return handler(url, init)
    })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// fetch rejects like this when the API can't be reached at all.
export function unreachable(): Promise<Response> {
  throw new TypeError('Failed to fetch')
}

export const unreachableMessage =
  "Can't reach OpenCaveMap right now. It may be updating, so try again in a minute."
