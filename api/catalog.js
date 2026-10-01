/**
 * Catálogo: audios, emociones (GIFs) y comercios con configuración propia.
 * Endpoints: /api/audios, /api/emotions, /api/merchants
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.catalog = (() => {
  const { request } = RoboticsApi.http;
  const id = value => encodeURIComponent(value);

  return {
    audios: {
      /** @param {string} [category] - greeting, sales, order, thanks, service, alert, music, brand. */
      list(category) {
        return request('GET', '/api/audios', { query: { category } });
      },
      /** {code, file_path: 'audio/...', display_text?, category, default_volume?, show_overlay?} */
      create(audio) {
        return request('POST', '/api/audios', { body: audio });
      },
      update(audioId, changes) {
        return request('PATCH', `/api/audios/${id(audioId)}`, { body: changes });
      },
      /** Falla con 409 si algún botón usa el audio: en ese caso, mejor desactivarlo ({active: false}). */
      remove(audioId) {
        return request('DELETE', `/api/audios/${id(audioId)}`);
      },
    },

    emotions: {
      list({ includeInactive = false } = {}) {
        return request('GET', '/api/emotions', { query: includeInactive ? { include_inactive: true } : undefined });
      },
      /** {code, label, sub_label?, icon?, gif_path, sort_order?} */
      create(emotion) {
        return request('POST', '/api/emotions', { body: emotion });
      },
      update(emotionId, changes) {
        return request('PATCH', `/api/emotions/${id(emotionId)}`, { body: changes });
      },
      remove(emotionId) {
        return request('DELETE', `/api/emotions/${id(emotionId)}`);
      },
    },

    merchants: {
      list() {
        return request('GET', '/api/merchants');
      },
      /** Crea o reemplaza. merchantId es el ID entero de api-totem (ej: 1 = Kíky). */
      upsert(merchantId, merchant) {
        return request('PUT', `/api/merchants/${id(merchantId)}`, { body: merchant });
      },
      /** También elimina las secciones propias de ese comercio. */
      remove(merchantId) {
        return request('DELETE', `/api/merchants/${id(merchantId)}`);
      },
    },
  };
})();
