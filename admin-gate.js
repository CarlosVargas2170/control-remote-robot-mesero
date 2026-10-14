/**
 * Compuerta de las pantallas de administración (robot-panel.html, merchants.html).
 *
 * Pide el token de medios (MEDIA_TOKEN), lo valida con GET /api/media/check y solo entonces deja
 * usar la página. El token vive en localStorage, nunca en el código. La protección real está en
 * el backend: las escrituras exigen X-Media-Token; esto solo evita ver y usar la pantalla sin él.
 *
 * Las páginas llaman a AdminGate.rejected(err) cuando una escritura responde 403: si el motivo es
 * el token de medios, se borra y vuelve a pedirse.
 */
const AdminGate = (() => {
  let overlay = null;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  /** 204 = token válido. Devuelve null si es válido o el texto del problema. */
  async function check() {
    if (!RoboticsApi.config.getMediaToken()) return 'Escribe el token para continuar.';
    try {
      await RoboticsApi.http.request('GET', '/api/media/check', { media: true });
      return null;
    } catch (err) {
      if (err && err.isUnauthorized) return 'Token incorrecto.';
      return 'No se pudo comprobar el token: el backend no responde.';
    }
  }

  function close() {
    if (overlay) overlay.remove();
    overlay = null;
    document.documentElement.classList.remove('gate-locked');
  }

  function open(message = '') {
    if (overlay) return;
    document.documentElement.classList.add('gate-locked');

    const input = el('input', { type: 'password', name: 'token', placeholder: 'Token de acceso', autocomplete: 'off', required: true });
    const status = el('p', { className: 'hint-text error-text', role: 'alert' }, message);
    const submit = el('button', { type: 'submit', className: 'btn-accent' }, 'Entrar');
    const form = el('form', { className: 'config-card media-form gate-card' },
      el('div', { className: 'block-header' }, el('span', { className: 'block-icon' }, '🔑'), el('span', { className: 'block-title' }, 'Acceso restringido')),
      el('p', { className: 'media-help' }, 'Esta pantalla modifica la configuración de los meseros. Ingresa el token de medios para continuar.'),
      el('label', { className: 'media-field' }, el('span', {}, 'Token'), input),
      submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = 'Comprobando...';
      RoboticsApi.config.setMediaToken(input.value);
      const problem = await check();
      submit.disabled = false;
      if (problem) {
        RoboticsApi.config.setMediaToken('');
        status.textContent = problem;
        input.select();
        return;
      }
      close();
    });

    overlay = el('div', { className: 'gate-overlay', role: 'dialog', ariaModal: 'true' }, form);
    document.body.append(overlay);
    input.focus();
  }

  /** Vuelve a pedir el token (por ejemplo, si cambió en el backend). */
  function lock(message = '') {
    RoboticsApi.config.setMediaToken('');
    open(message);
  }

  /** Para el catch de una escritura: si falló por el token de medios, vuelve a pedirlo. */
  function rejected(err) {
    const detail = String((err && err.detail) || '');
    if (err && err.isUnauthorized && /media token/i.test(detail)) {
      lock('El token ya no es válido. Ingrésalo de nuevo.');
      return true;
    }
    return false;
  }

  async function init() {
    // Tapa la página desde el inicio para que no se use mientras se comprueba el token guardado.
    document.documentElement.classList.add('gate-locked');
    const problem = RoboticsApi.config.getMediaToken() ? await check() : '';
    if (problem === null) {
      close();
      return;
    }
    document.documentElement.classList.remove('gate-locked');
    open(problem || '');
  }

  document.addEventListener('DOMContentLoaded', init);
  return { lock, rejected };
})();
