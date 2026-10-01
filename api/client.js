/**
 * Cliente HTTP base para robotics-backend.
 *
 * - Agrega el token del panel (cabecera X-Panel-Token) a cada petición.
 * - Corta las peticiones que tardan demasiado.
 * - Convierte cualquier error en un RoboticsApi.ApiError con `status` y `detail`.
 * - `getCached` guarda la última respuesta buena de una lectura y la devuelve si
 *   el backend no responde, para que el panel siga funcionando sin conexión.
 */
window.RoboticsApi = window.RoboticsApi || {};

(() => {
  const DEFAULT_TIMEOUT_MS = 10000;
  const CACHE_PREFIX = 'rb_cache:';

  /** Error de una llamada al backend. status = 0 cuando no hubo respuesta (red, timeout). */
  class ApiError extends Error {
    constructor(message, { status = 0, detail = null, path = '' } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.detail = detail;
      this.path = path;
    }

    /** Sin respuesta del backend: caído, sin red o timeout. */
    get isNetworkError() { return this.status === 0; }

    /** El token del panel falta o no es válido. */
    get isUnauthorized() { return this.status === 401 || this.status === 403; }
  }

  function buildUrl(path, query) {
    const url = new URL(RoboticsApi.config.getBackendUrl() + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /** FastAPI devuelve {detail: "..."} o, en errores de validación, {detail: [{msg, loc}, ...]}. */
  function describeDetail(detail) {
    if (Array.isArray(detail)) {
      return detail.map(d => `${(d.loc || []).slice(1).join('.') || 'body'}: ${d.msg}`).join('; ');
    }
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  }

  /**
   * Hace una petición al backend.
   * @param {string} method - GET, POST, PUT, PATCH, DELETE.
   * @param {string} path - Ruta que empieza con /api (ej: '/api/robots').
   * @param {Object} [options]
   * @param {Object} [options.query] - Parámetros de la URL; se omiten los vacíos.
   * @param {Object} [options.body] - Se envía como JSON.
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.raw] - Devuelve el Response sin leer (para streams de audio).
   * @returns {Promise<any>} JSON de la respuesta, null si es 204, o el Response si raw.
   */
  async function request(method, path, { query, body, timeoutMs = DEFAULT_TIMEOUT_MS, raw = false } = {}) {
    const headers = { 'Accept': raw ? '*/*' : 'application/json' };
    const token = RoboticsApi.config.getPanelToken();
    if (token) headers['X-Panel-Token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (err) {
      const reason = err && err.name === 'TimeoutError' ? `sin respuesta en ${timeoutMs / 1000}s` : 'no se pudo conectar';
      throw new ApiError(`Backend ${reason} (${method} ${path})`, { path });
    }

    if (!response.ok) {
      let detail = null;
      try { detail = (await response.json()).detail; } catch { /* cuerpo vacío o no JSON */ }
      const text = detail ? describeDetail(detail) : response.statusText;
      throw new ApiError(`HTTP ${response.status} en ${method} ${path}: ${text}`, {
        status: response.status,
        detail,
        path,
      });
    }

    if (raw) return response;
    if (response.status === 204) return null;
    return response.json();
  }

  function readCache(key) {
    try {
      const stored = localStorage.getItem(CACHE_PREFIX + key);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
    } catch { /* almacenamiento lleno o bloqueado: seguimos sin caché */ }
  }

  /**
   * GET que guarda la última respuesta buena. Si el backend no responde (error de red),
   * devuelve esa copia. Los errores con respuesta (403, 404...) se propagan siempre.
   * @returns {Promise<{data: any, fromCache: boolean, savedAt: string|null}>}
   */
  async function getCached(path, { query, cacheKey } = {}) {
    const key = cacheKey || `${path}?${new URLSearchParams(query || {}).toString()}`;
    try {
      const data = await request('GET', path, { query });
      writeCache(key, data);
      return { data, fromCache: false, savedAt: null };
    } catch (err) {
      const cached = err.isNetworkError ? readCache(key) : null;
      if (!cached) throw err;
      return { data: cached.data, fromCache: true, savedAt: cached.savedAt };
    }
  }

  /** Borra todas las copias guardadas (por ejemplo, al cambiar de backend). */
  function clearCache() {
    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith(CACHE_PREFIX))
        .forEach(key => localStorage.removeItem(key));
    } catch { /* nada que borrar */ }
  }

  /** GET /api/health — no requiere token. */
  function health() {
    return request('GET', '/api/health', { timeoutMs: 3000 });
  }

  RoboticsApi.ApiError = ApiError;
  RoboticsApi.http = { request, getCached, clearCache };
  RoboticsApi.health = health;
})();
