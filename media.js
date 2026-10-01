/**
 * Página de medios: solo sube audios y GIFs/videos a Cloudinary a través del backend.
 * El backend guarda la fila y, para los audios, crea su botón en la sección elegida.
 * Editar o borrar se hace desde Postman (PATCH / DELETE /api/audios, /api/emotions).
 */
const MediaPage = (() => {
  /** Crea un elemento con propiedades e hijos. Nunca usa innerHTML. */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function errorText(err) {
    if (err && err.isUnauthorized) return 'Token del panel inválido: revísalo en el panel (Backend ⚙️).';
    if (err && err.status === 413) return 'El archivo es demasiado grande.';
    return err && err.message ? err.message : String(err);
  }

  function setStatus(node, text, type = '') {
    node.textContent = text;
    node.classList.toggle('ok', type === 'ok');
    node.classList.toggle('error-text', type === 'err');
  }

  /**
   * Código interno (único) a partir del nombre: "¿Hola, qué tal?" → "hola_que_tal_k3x9".
   * El final aleatorio evita choques entre nombres iguales; el operador nunca lo escribe.
   */
  function codeFrom(name, maxLength, fallback) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const base = String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength - suffix.length - 1)
      .replace(/_+$/, '');
    return `${base || fallback}_${suffix}`;
  }

  /** Lee los campos del formulario (sin el archivo). */
  function formFields(form) {
    const fields = {};
    for (const input of form.elements) {
      if (input.name && input.type !== 'file') fields[input.name] = input.value.trim();
    }
    return fields;
  }

  /**
   * Sube el archivo del formulario con `upload(file, fields)`, muestra el estado y,
   * si sale bien, limpia el formulario y muestra lo subido con `renderResult`.
   */
  function bindUploadForm(formId, resultId, { pendingText, upload, doneText, renderResult }) {
    const form = document.getElementById(formId);
    const result = document.getElementById(resultId);
    const status = form.querySelector('.media-form-status');
    const button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const file = form.elements.file.files[0];
      if (!file) return;

      button.disabled = true;
      result.replaceChildren();
      setStatus(status, pendingText(file));
      try {
        const fields = formFields(form);
        const saved = await upload(file, fields);
        setStatus(status, doneText(saved, form), 'ok');
        result.replaceChildren(renderResult(saved));
        form.reset();
        form.dispatchEvent(new Event('reset-done'));
      } catch (err) {
        setStatus(status, errorText(err), 'err');
      } finally {
        button.disabled = false;
      }
    });
  }

  // ── Audios ──

  /** En "Sonidos" el nombre es la opción del desplegable; en Saludos/Alertas, el texto del botón. */
  function syncFormWithSection() {
    const form = document.getElementById('audioForm');
    const isDropdown = form.elements.section.value === 'sirens';
    document.getElementById('buttonLabelTitle').textContent = isDropdown ? 'Nombre en la lista de sonidos' : 'Nombre del botón';
    form.elements.button_label.placeholder = isDropdown ? 'Pedro pedro' : '¿Hola, qué tal?';
    form.elements.button_icon.placeholder = isDropdown ? '🎵' : '👋';
  }

  function uploadAudio(file, fields) {
    // El texto se muestra en el robot solo si se escribió uno; vacío = solo suena.
    return RoboticsApi.catalog.audios.upload(file, {
      ...fields,
      code: codeFrom(fields.button_label, 60, 'audio'),
      show_overlay: Boolean(fields.display_text),
    });
  }

  function uploadEmotion(file, fields) {
    return RoboticsApi.catalog.emotions.upload(file, { ...fields, code: codeFrom(fields.label, 30, 'gif') });
  }

  // ── Inicio ──

  function showTab(name) {
    document.querySelectorAll('.media-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
    document.querySelectorAll('.media-panel').forEach(panel => { panel.hidden = panel.id !== `tab-${name}`; });
    try { localStorage.setItem('rb_mediaTab', name); } catch { /* solo es una preferencia */ }
  }

  /** Comprueba backend y token con una lectura liviana. */
  async function checkBackend() {
    const dot = document.getElementById('mediaDot');
    const text = document.getElementById('mediaStatusText');
    try {
      await RoboticsApi.catalog.merchants.list();
      dot.className = 'dot online';
      text.textContent = 'Backend';
    } catch (err) {
      dot.className = 'dot offline';
      text.textContent = err.isUnauthorized ? 'Token inválido' : 'Sin backend';
    }
  }

  function init() {
    document.querySelectorAll('.media-tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
    let saved = null;
    try { saved = localStorage.getItem('rb_mediaTab'); } catch { /* sin almacenamiento */ }
    showTab(saved === 'emotions' ? 'emotions' : 'audios');

    const audioForm = document.getElementById('audioForm');
    audioForm.elements.section.addEventListener('change', syncFormWithSection);
    audioForm.addEventListener('reset-done', syncFormWithSection);
    syncFormWithSection();

    bindUploadForm('audioForm', 'audioResult', {
      pendingText: file => `Subiendo ${file.name}...`,
      upload: uploadAudio,
      doneText: (audio, form) =>
        `"${form.elements.button_label.value.trim()}" subido y agregado a ${form.elements.section.selectedOptions[0].textContent}. ` +
        (audio.show_overlay ? 'El robot mostrará el texto mientras suena.' : 'Solo suena, sin texto en el robot.'),
      renderResult: audio => el('audio', { controls: true, src: audio.url }),
    });

    bindUploadForm('emotionForm', 'emotionResult', {
      pendingText: file => `Subiendo ${file.name}${file.type.startsWith('video/') ? ' (convirtiendo a GIF, puede tardar)' : ''}...`,
      upload: uploadEmotion,
      doneText: emotion => `"${emotion.label}" subida. Ya aparece en la sección Gifs del panel.`,
      renderResult: emotion => el('img', { className: 'media-thumb', src: emotion.gif_url, alt: emotion.label }),
    });

    checkBackend();
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
