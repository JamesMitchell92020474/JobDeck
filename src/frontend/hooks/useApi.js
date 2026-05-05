const BASE = '/api'

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body instanceof FormData) {
    opts.body = body
  }
  const r = await fetch(`${BASE}${path}`, opts)
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || r.statusText)
  }
  return r.json()
}

export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  put:    (path, body)  => req('PUT',    path, body),
  delete: (path)        => req('DELETE', path),
}

export default api
