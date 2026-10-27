// One storage boundary for a shared exhibit. Personal mode alone uses browser persistence.
export const CONTROL_GROUPS = Object.freeze(['motif', 'layout', 'custom', 'palette', 'bridge']);
const VISITOR_KEYS = ['yifanglan.collection.v1', 'yifanglan.draft.v1', 'yifanglan.draft.v1.recovery', 'indigo.exploration.v1', 'indigo.exploration.v1.active', 'indigo.living.v1'];

export function resolveVisitorMode(search = '', declared = '') {
  const match = String(search).match(/(?:^|[?&])mode=([^&]*)/);
  return (match ? match[1] : declared) === 'personal' ? 'personal' : 'kiosk';
}

export function createVisitorSession({ mode = 'kiosk', persistent, transient } = {}) {
  const personal = mode === 'personal';
  let generation = 0, sessionId = '', memory = new Map(), temporary = new Map();
  const keys = new Set(VISITOR_KEYS), temporaryKeys = new Set(VISITOR_KEYS);
  const wrap = (source, temporaryStore = false) => ({
    getItem(key) { return personal ? source?.getItem(key) ?? null : (temporaryStore ? temporary : memory).get(key) ?? null; },
    setItem(key, value) {
      (temporaryStore ? temporaryKeys : keys).add(key);
      if (personal) { if (!source) throw new Error('浏览器存储不可用'); source.setItem(key, String(value)); }
      else (temporaryStore ? temporary : memory).set(key, String(value));
    },
    removeItem(key) { if (personal) source?.removeItem(key); else (temporaryStore ? temporary : memory).delete(key); }
  });
  return {
    mode: personal ? 'personal' : 'kiosk', storage: wrap(persistent), transient: wrap(transient, true),
    get generation() { return generation; }, get sessionId() { return sessionId; },
    invalidate() { generation++; },
    isCurrent(ticket) { return ticket === generation; },
    reset(id) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('游客会话编号无效');
      generation++; sessionId = id; memory = new Map(); temporary = new Map();
      if (personal) {
        for (const key of keys) { try { persistent?.removeItem(key); } catch {} }
        for (const key of temporaryKeys) { try { transient?.removeItem(key); } catch {} }
      }
    }
  };
}

export function getVisitorSession(host = window) {
  if (host.indigoVisitorSession) return host.indigoVisitorSession;
  let persistent, transient;
  try { persistent = host.localStorage || globalThis.localStorage; } catch {}
  try { transient = host.sessionStorage || globalThis.sessionStorage; } catch {}
  const mode = resolveVisitorMode(host.location?.search ?? globalThis.location?.search ?? '', host.document?.documentElement?.dataset?.mode ?? globalThis.document?.documentElement?.dataset?.mode);
  return host.indigoVisitorSession = createVisitorSession({ mode, persistent, transient });
}
