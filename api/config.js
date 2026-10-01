/**
 * Configuración de conexión con robotics-backend.
 *
 * El panel trae la URL y el token por defecto para que el operador no tenga
 * que configurar nada. Lo guardado desde "Backend ⚙️" (localStorage) tiene
 * prioridad, así se puede apuntar a otro backend sin tocar el código.
 *
 * Si se rota PANEL_TOKEN en el backend, hay que actualizar DEFAULT_PANEL_TOKEN.
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.config = (() => {
  const LS_BACKEND_URL = 'rb_backendUrl';
  const LS_PANEL_TOKEN = 'rb_panelToken';
  const DEFAULT_BACKEND_URL = 'http://localhost:8090';
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
