/**
 * Distribución del panel: secciones y botones que antes estaban fijos en index.html.
 * Endpoints: /api/panel...
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.panel = (() => {
  const { request, getCached } = RoboticsApi.http;

  return {
    /**
     * Panel ya resuelto para un robot y el comercio seleccionado: emociones y
     * secciones con sus botones (solo los que corresponden a ese robot y comercio).
     * Usa la copia guardada si el backend no responde.
     * @param {string} robotCode - ej: 'mesero-2'.
     * @param {number|string|null} merchantId - null si todavía no se eligió comercio.
     * @returns {Promise<{data: {robot, merchant_id, emotions, sections}, fromCache: boolean, savedAt: string|null}>}
     */
    get(robotCode, merchantId = null) {
      const query = { robot: robotCode };
      if (merchantId !== null && merchantId !== undefined && merchantId !== '') {
        query.merchant_id = Number(merchantId);
      }
      return getCached('/api/panel', { query, cacheKey: `panel:${robotCode}:${query.merchant_id ?? '-'}` });
    },

    // ── Administración (para una futura pantalla de configuración) ──

    /** Todas las secciones con todos sus botones, incluidos los inactivos. */
    listSections() {
      return request('GET', '/api/panel/sections');
    },

    /** {code, title, icon?, kind: 'grid'|'dropdown', columns?, visibility, merchant_id?, sort_order?} */
    createSection(section) {
      return request('POST', '/api/panel/sections', { body: section });
    },

    updateSection(sectionId, changes) {
      return request('PATCH', `/api/panel/sections/${encodeURIComponent(sectionId)}`, { body: changes });
    },

    /** Elimina la sección y todos sus botones. */
    deleteSection(sectionId) {
      return request('DELETE', `/api/panel/sections/${encodeURIComponent(sectionId)}`);
    },

    /** {action, audio_code?, endpoint?, robot_code?, label, sub_label?, icon?, style?, force?, sort_order?} */
    createButton(sectionId, button) {
      return request('POST', `/api/panel/sections/${encodeURIComponent(sectionId)}/buttons`, { body: button });
    },

    /** Reemplaza el botón completo (mismos campos que createButton). */
    replaceButton(buttonId, button) {
      return request('PUT', `/api/panel/buttons/${encodeURIComponent(buttonId)}`, { body: button });
    },

    deleteButton(buttonId) {
      return request('DELETE', `/api/panel/buttons/${encodeURIComponent(buttonId)}`);
    },
  };
})();
