// Local prototype: inspect only an explicitly selected loopback GET endpoint.
// Never retain headers, cookies, request bodies or unrelated traffic.
export function makeReadRecorder(chrome, send) {
  const active = new Map();
  chrome.debugger.onEvent.addListener(({tabId}, method, p) => {
    const s = active.get(tabId);
    if (!s) return;
    if (method === 'Network.requestWillBeSent') {
      try {
        const u = new URL(p.request.url);
        if (p.request.method !== 'GET' || u.origin !== s.origin || u.pathname !== s.path
          || u.username || u.password || u.hash) return;
        const entries = [...u.searchParams];
        if (entries.length !== 1 || entries[0][0] !== s.queryKey
          || !/^[a-z0-9_-]{1,40}$/.test(entries[0][1])) return;
        if (s.requests.size < 20) s.requests.set(p.requestId, {value: entries[0][1]});
      } catch {}
    }
    if (method === 'Network.responseReceived') {
      const r = s.requests.get(p.requestId);
      if (r && p.response.status === 200 && p.response.mimeType === 'application/json') {
        s.observations.push({origin: s.origin, path: s.path, queryKey: s.queryKey,
          value: r.value, method: 'GET', status: 200, mimeType: 'application/json'});
        s.requests.delete(p.requestId);
      }
    }
  });
  return {
    async start(tabId, pageUrl, {path, queryKey}) {
      const u = new URL(pageUrl);
      if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port)
        throw Error('Prototype records only an explicit 127.0.0.1 HTTP fixture');
      if (path !== '/api/catalog' || queryKey !== 'category')
        throw Error('Prototype allows only /api/catalog?category=');
      if (active.has(tabId)) throw Error('Recording already active');
      active.set(tabId, {origin: u.origin, path, queryKey, requests: new Map(), observations: []});
      try { await send(tabId, 'Network.enable'); }
      catch (e) { active.delete(tabId); throw e; }
      return {recording: true, origin: u.origin, path, queryKey, storesCredentials: false};
    },
    async stop(tabId) {
      const s = active.get(tabId);
      if (!s) throw Error('No recording on this owned tab');
      active.delete(tabId);
      await send(tabId, 'Network.disable');
      return {observations: s.observations.slice(0, 20)};
    },
    forget(tabId) { active.delete(tabId); }
  };
}
