/**
 * Robots: lista para el selector, alta/edición, token del robot y ajustes.
 * Endpoints: /api/robots...
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.robots = (() => {
  const { request, getCached } = RoboticsApi.http;
  const robotPath = code => `/api/robots/${encodeURIComponent(code)}`;

  return {
    /**
     * Robots activos para el selector (code, name, base_url, tts_available...).
     * Usa la copia guardada si el backend no responde.
     * @returns {Promise<{data: Object[], fromCache: boolean, savedAt: string|null}>}
     */
    list({ includeInactive = false } = {}) {
      return getCached('/api/robots', {
        query: includeInactive ? { include_inactive: true } : undefined,
        cacheKey: includeInactive ? 'robots:all' : 'robots',
      });
    },

    /** Registra un robot: {code, name, host, api_port?, tts_service_id?, sort_order?}. */
    create(robot) {
      return request('POST', '/api/robots', { body: robot });
    },

    /** Edita un robot. Envía solo los campos a cambiar (ej: {active: false}). */
    update(code, changes) {
      return request('PATCH', robotPath(code), { body: changes });
    },

    /**
     * Emite un token nuevo para el robot e invalida el anterior.
     * El token se devuelve UNA sola vez: hay que guardarlo en el .env del robot.
     * @returns {Promise<{code: string, token: string}>}
     */
    rotateToken(code) {
      return request('POST', `${robotPath(code)}/token`);
    },

    /** Ajustes del robot (expiración del QR, carrito, timeouts). */
    getSettings(code) {
      return request('GET', `${robotPath(code)}/settings`);
    },

    /** Edita ajustes del robot. Envía solo los campos a cambiar. */
    updateSettings(code, changes) {
      return request('PUT', `${robotPath(code)}/settings`, { body: changes });
    },
  };
})();
