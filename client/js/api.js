// REST calls + session token storage. The token is only a bearer credential;
// the server validates it on every request and socket connection.
const KEY = 'yoink_token';

export const session = {
  get token() {
    try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch { return null; }
  },
  save(token, remember) {
    try {
      sessionStorage.setItem(KEY, token);
      if (remember) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
    } catch { /* storage unavailable */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = session.token;
  if (t) headers.Authorization = 'Bearer ' + t;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { error: 'Cannot reach the yoink! server. Is it running?' };
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) return { error: data.error || `Request failed (${res.status}).`, field: data.field, status: res.status };
  return data;
}

export const api = {
  register: (username, password) => call('POST', '/api/register', { username, password }),
  login: (username, password) => call('POST', '/api/login', { username, password }),
  logout: () => call('POST', '/api/logout'),
  me: () => call('GET', '/api/me'),
};
