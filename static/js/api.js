/* API client — wraps fetch, handles JSON, errors, and a lightweight
   localStorage-based offline cache so key views still render without a
   connection (data syncs again once back online). */

const API = {
  async _req(method, url, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      // Network failure — try cache for GET requests
      if (method === 'GET') {
        const cached = OfflineCache.get(url);
        if (cached) return cached;
      }
      throw new Error('You appear to be offline. Some data may be out of date.');
    }
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    if (method === 'GET') OfflineCache.set(url, data);
    return data;
  },
  get(url) { return this._req('GET', url); },
  post(url, body) { return this._req('POST', url, body); },
  put(url, body) { return this._req('PUT', url, body); },
  del(url) { return this._req('DELETE', url); },
};

const OfflineCache = {
  prefix: 'budgetmind_cache::',
  get(url) {
    try {
      const raw = localStorage.getItem(this.prefix + url);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(url, data) {
    try { localStorage.setItem(this.prefix + url, JSON.stringify(data)); } catch { /* storage full/unavailable */ }
  }
};

window.addEventListener('online', () => showToast('Back online — data is syncing.', 'success'));
window.addEventListener('offline', () => showToast('You are offline. Showing cached data where available.', 'info'));
