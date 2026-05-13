// A simple wrapper around the browser's built-in fetch() function.
// Every network request in the frontend goes through these helpers so we
// don't have to repeat the same error-handling code everywhere.
//
// All paths are relative to /api — so api.get('/chat') hits /api/chat.

const BASE = '/api'

// Internal helper that makes the actual HTTP request.
// "method" is GET, POST, PUT, PATCH, or DELETE.
// "body" is optional data to send (used with POST/PUT/PATCH).
async function req(method, path, body) {
  const opts = { method, headers: {} }

  if (body && !(body instanceof FormData)) {
    // Tell the server we're sending JSON data.
    opts.headers['Content-Type'] = 'application/json'
    // Convert the JavaScript object to a JSON string for transmission.
    opts.body = JSON.stringify(body)
  } else if (body instanceof FormData) {
    // FormData (used for file uploads) sets its own Content-Type header,
    // so we pass it through without setting one ourselves.
    opts.body = body
  }

  const r = await fetch(`${BASE}${path}`, opts)

  // If the server returned an error status (4xx or 5xx), throw an error
  // so the calling code can display a message to the user.
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || r.statusText)
  }

  // Parse the JSON response and return it.
  return r.json()
}

// The four HTTP methods the app uses, exported as a simple object.
// Usage example: api.get('/jobs') or api.post('/jobs', { title: '...' })
export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  put:    (path, body)  => req('PUT',    path, body),
  patch:  (path, body)  => req('PATCH',  path, body),
  delete: (path)        => req('DELETE', path),
}

export default api
