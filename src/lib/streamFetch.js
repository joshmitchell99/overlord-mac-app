/**
 * Minimal SSE reader for POST endpoints that stream `data: {...}\n\n` events.
 *
 * Usage:
 *   await streamSSE({
 *     url, body, headers,
 *     onEvent: (evt) => { ... },   // called per decoded JSON event
 *     signal,                       // optional AbortSignal
 *   })
 *
 * The server emits events like:
 *   { type: 'delta', text: '...' }   // incremental text
 *   { type: 'final', ... }           // final structured payload
 *   { type: 'error', error: '...' }  // stream-side failure
 */

export async function streamSSE({ url, body, headers = {}, onEvent, signal }) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal,
  })
  if (!resp.ok) {
    throw new Error(`Server ${resp.status}`)
  }
  if (!resp.body) {
    throw new Error('Response body is not readable')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Split on SSE event boundaries: blank line separates events.
      let sepIdx
      while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        // Handle multi-line event (ignoring for now - we only emit single-line data:)
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (!dataStr.trim()) continue
            try {
              const evt = JSON.parse(dataStr)
              onEvent?.(evt)
            } catch (e) {
              console.warn('[streamSSE] bad JSON in event:', dataStr, e)
            }
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }
}
