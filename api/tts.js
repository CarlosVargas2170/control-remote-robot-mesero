/**
 * Texto a voz a través del backend: el panel ya no llama al TTS del robot (:9000)
 * ni conoce su token. Cada robot usa el servicio TTS que tenga asignado.
 * Endpoints: /api/robots/{code}/tts, /api/tts-services
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.tts = (() => {
  const { request } = RoboticsApi.http;
  const ttsPath = code => `/api/robots/${encodeURIComponent(code)}/tts`;

  return {
    /** Estado del TTS del robot ({status, gpu, speakers_loaded}). 409 si el robot no tiene TTS. */
    health(robotCode) {
      return request('GET', `${ttsPath(robotCode)}/health`, { timeoutMs: 5000 });
    },

    /**
     * Sintetiza el texto con el TTS del robot. Devuelve el Response SIN leer: su cuerpo es
     * audio PCM float32 little-endian, mono, 24 kHz en streaming (lo que reproduce
     * playTtsStream en app.js).
     * @returns {Promise<Response>}
     */
    synthesize(robotCode, text, { speakerId = 'default', language = 'es' } = {}) {
      return request('POST', ttsPath(robotCode), {
        body: { text, speaker_id: speakerId, language },
        raw: true,
        timeoutMs: 0, // el audio llega en streaming; no cortar a mitad
      });
    },

    /** Servicios TTS (uno por robot o uno central). El token nunca se devuelve, solo `has_token`. */
    services: {
      list() {
        return request('GET', '/api/tts-services');
      },
      /** {name, base_url, token?, active?} */
      create(service) {
        return request('POST', '/api/tts-services', { body: service });
      },
      /** Para cambiar el token: {token: '...'}; para borrarlo: {token: null}. */
      update(serviceId, changes) {
        return request('PATCH', `/api/tts-services/${encodeURIComponent(serviceId)}`, { body: changes });
      },
      /** Los robots que lo usaban quedan sin TTS. */
      remove(serviceId) {
        return request('DELETE', `/api/tts-services/${encodeURIComponent(serviceId)}`);
      },
    },
  };
})();
