/**
 * Configuración de conexión con robotics-backend.
 *
 * El panel trae la URL y el token por defecto para que el operador no tenga
 * que configurar nada. Lo guardado desde "Backend ⚙️" (localStorage) tiene
 * prioridad, así se puede apuntar a otro backend sin tocar el código.
 *
 * Si se rota PANEL_TOKEN en el backend, hay que actualizar DEFAULT_PANEL_TOKEN.
 *
 * El token de medios (MEDIA_TOKEN) NO está en el código: solo lo escribe el
 * administrador en la página de medios, queda en su localStorage y solo se envía
 * al subir, reemplazar o borrar audios y GIFs.
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.config = (() => {
  const LS_BACKEND_URL = 'rb_backendUrl';
  const LS_PANEL_TOKEN = 'rb_panelToken';
  const LS_MEDIA_TOKEN = 'rb_mediaToken';
  // const DEFAULT_BACKEND_URL = 'http://localhost:8090';
  const DEFAULT_BACKEND_URL = 'https://robotics-backend-5o4m.onrender.com';
  const DEFAULT_PANEL_TOKEN = 'gGHFfOda2KUbh9UOxXKqkNW1OVCHfgRqsmyUJ9lkylM';

  /** localStorage puede fallar (modo privado, almacenamiento bloqueado). */
  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function write(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch { /* sin almacenamiento: el valor solo dura esta sesión */ }
  }

  /** URL base del backend, sin barra final (ej: http://100.64.0.10:8090). */
  function getBackendUrl() {
    return (read(LS_BACKEND_URL) || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  }

  function setBackendUrl(url) {
    write(LS_BACKEND_URL, String(url || '').trim().replace(/\/+$/, ''));
  }

  function getPanelToken() {
    return read(LS_PANEL_TOKEN) || DEFAULT_PANEL_TOKEN;
  }

  function setPanelToken(token) {
    write(LS_PANEL_TOKEN, String(token || '').trim());
  }

  /** Olvida el token guardado y vuelve al de por defecto. */
  function clearPanelToken() {
    write(LS_PANEL_TOKEN, '');
  }

  function getMediaToken() {
    return read(LS_MEDIA_TOKEN) || '';
  }

  function setMediaToken(token) {
    write(LS_MEDIA_TOKEN, String(token || '').trim());
  }

  function isConfigured() {
    return Boolean(getBackendUrl() && getPanelToken());
  }

  return {
    DEFAULT_BACKEND_URL,
    getBackendUrl,
    setBackendUrl,
    getPanelToken,
    setPanelToken,
    clearPanelToken,
    getMediaToken,
    setMediaToken,
    isConfigured,
  };
})();
