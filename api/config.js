/**
 * Configuración de conexión con robotics-backend.
 *
 * La URL del backend y el token del panel se guardan en el navegador del
 * operador (localStorage), nunca en el código: el token lo ingresa el
 * operador una sola vez.
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.config = (() => {
  const LS_BACKEND_URL = 'rb_backendUrl';
  const LS_PANEL_TOKEN = 'rb_panelToken';
  const DEFAULT_BACKEND_URL = 'http://localhost:8090';

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
    return read(LS_PANEL_TOKEN) || '';
  }

  function setPanelToken(token) {
    write(LS_PANEL_TOKEN, String(token || '').trim());
  }

  /** Olvida el token (por ejemplo, al cerrar sesión o si el backend lo rechaza). */
  function clearPanelToken() {
    write(LS_PANEL_TOKEN, '');
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
    isConfigured,
  };
})();
