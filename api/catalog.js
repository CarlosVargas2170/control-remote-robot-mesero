/**
 * Catálogo: audios, emociones (GIFs) y comercios con configuración propia.
 * Endpoints: /api/audios, /api/emotions, /api/merchants
 *
 * Los audios y GIFs nuevos se suben con `upload`: el backend los guarda en
 * Cloudinary y devuelve la fila con su `url` / `gif_url`. Borrar no está en el
 * panel a propósito (se hace desde Postman con DELETE).
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.catalog = (() => {
  const { request } = RoboticsApi.http;
  const id = value => encodeURIComponent(value);
  const UPLOAD_TIMEOUT_MS = 120000; // los videos se convierten a GIF durante la subida

  /** Arma el multipart: el archivo más los campos que no estén vacíos. */
  function toForm(file, fields = {}) {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
    }
    return form;
  }

  return {
    audios: {
      /** @param {string} [category] - greeting, sales, order, thanks, service, alert, music, brand. */
      list(category) {
        return request('GET', '/api/audios', { query: { category } });
      },
      /** Audio incluido en la app del robot: {code, file_path: 'audio/...', display_text?, category, ...} */
      create(audio) {
        return request('POST', '/api/audios', { body: audio });
      },
      /**
       * Sube un audio nuevo a Cloudinary (wav, mp3, ogg, m4a, aac; máx. 20 MB).
       * @param {File} file
       * @param {{code, category, display_text?, default_volume?, show_overlay?, active?}} fields
       */
      upload(file, fields) {
        return request('POST', '/api/audios/upload', { media: true, form: toForm(file, fields), timeoutMs: UPLOAD_TIMEOUT_MS });
      },
      /** Reemplaza el archivo de un audio existente (también los incluidos en la app). */
      replaceFile(audioId, file) {
        return request('PUT', `/api/audios/${id(audioId)}/file`, { media: true, form: toForm(file), timeoutMs: UPLOAD_TIMEOUT_MS });
      },
      update(audioId, changes) {
        return request('PATCH', `/api/audios/${id(audioId)}`, { body: changes });
      },
      /** Falla con 409 si algún botón usa el audio: en ese caso, mejor desactivarlo ({active: false}). */
      remove(audioId) {
        return request('DELETE', `/api/audios/${id(audioId)}`, { media: true });
      },
    },

    emotions: {
      list({ includeInactive = false } = {}) {
        return request('GET', '/api/emotions', { query: includeInactive ? { include_inactive: true } : undefined });
      },
      /** GIF incluido en la app del robot: {code, label, sub_label?, icon?, gif_path, sort_order?} */
      create(emotion) {
        return request('POST', '/api/emotions', { body: emotion });
      },
      /**
       * Sube un GIF (máx. 10 MB) o un video mp4/webm/mov (máx. 40 MB, se convierte a GIF).
       * @param {File} file
       * @param {{code, label, sub_label?, icon?, sort_order?, active?}} fields
       */
      upload(file, fields) {
        return request('POST', '/api/emotions/upload', { media: true, form: toForm(file, fields), timeoutMs: UPLOAD_TIMEOUT_MS });
      },
      replaceFile(emotionId, file) {
        return request('PUT', `/api/emotions/${id(emotionId)}/file`, { media: true, form: toForm(file), timeoutMs: UPLOAD_TIMEOUT_MS });
      },
      update(emotionId, changes) {
        return request('PATCH', `/api/emotions/${id(emotionId)}`, { body: changes });
      },
      remove(emotionId) {
        return request('DELETE', `/api/emotions/${id(emotionId)}`, { media: true });
      },
    },

    media: {
      /** Comprueba el token de medios (204 si es válido, 403 si no). */
      check() {
        return request('GET', '/api/media/check', { media: true });
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
