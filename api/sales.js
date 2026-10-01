/**
 * Ventas de cada robot (las reporta el robot con su propio token; el panel solo las lee).
 * Endpoints: /api/robots/{code}/sales, /api/robots/{code}/sales/summary
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.sales = (() => {
  const { request } = RoboticsApi.http;
  const salesPath = code => `/api/robots/${encodeURIComponent(code)}/sales`;
  const iso = date => (date instanceof Date ? date.toISOString() : date);

  return {
    /**
     * Resumen de ventas pagadas, con el mismo formato que el contador del robot
     * (totalSales, totalAmount, byProduct, recent...). Sin `since`, desde las 00:00 de hoy.
     * @param {string} robotCode
     * @param {{since?: Date|string, until?: Date|string}} [range]
     */
    summary(robotCode, { since, until } = {}) {
      return request('GET', `${salesPath(robotCode)}/summary`, { query: { since: iso(since), until: iso(until) } });
    },

    /** Ventas individuales, más recientes primero. Sin `since`, desde las 00:00 de hoy. */
    list(robotCode, { since, until, limit = 50, offset = 0 } = {}) {
      return request('GET', salesPath(robotCode), { query: { since: iso(since), until: iso(until), limit, offset } });
    },
  };
})();
