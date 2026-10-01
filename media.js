/**
 * Página de medios: sube audios y GIFs/videos a Cloudinary a través del backend,
 * y edita sus datos. Borrar no se ofrece aquí (se hace desde Postman con DELETE).
 */
const MediaPage = (() => {
  const CATEGORIES = {
    greeting: 'Saludos',
    sales: 'Ventas',
    order: 'Pedidos',
    thanks: 'Agradecimientos',
    service: 'Servicio',
    alert: 'Alertas',
    music: 'Música',
    brand: 'Marca',
  };

  let audios = [];
  let emotions = [];

  // ── Helpers ──

  /** Crea un elemento con propiedades y atributos (`data-*`, `aria-*`) e hijos. Nunca usa innerHTML. */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (key.startsWith('data-') || key.startsWith('aria-')) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  function errorText(err) {
    if (err && err.isUnauthorized) return 'Token del panel inválido: revísalo en el panel (Backend ⚙️).';
    if (err && err.status === 413) return 'El archivo es demasiado grande.';
    return err && err.message ? err.message : String(err);
  }

  function setStatus(node, text, type = '') {
    node.textContent = text;
    node.className = node.className.replace(/\s*\b(ok|err|error-text)\b/g, '');
    if (type === 'ok') node.classList.add('ok');
    if (type === 'err') node.classList.add(node.classList.contains('hint-text') ? 'error-text' : 'err');
  }

  function setBackendStatus(ok, text) {
    document.getElementById('mediaDot').className = `dot ${ok ? 'online' : 'offline'}`;
    document.getElementById('mediaStatusText').textContent = text;
  }

  /** Lee los campos del formulario (sin el archivo); los checkbox se envían como true/false. */
  function formFields(form) {
    const fields = {};
    for (const input of form.elements) {
      if (!input.name || input.type === 'file') continue;
      fields[input.name] = input.type === 'checkbox' ? input.checked : input.value.trim();
    }
    return fields;
  }

  /** Abre el selector de archivos y devuelve el elegido (o null si se cancela). */
  function pickFile(accept) {
    return new Promise(resolve => {
      const input = el('input', { type: 'file', accept });
      input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
      input.click();
    });
  }

  /** Ejecuta una acción de una tarjeta mostrando su estado y deshabilitando los botones mientras dura. */
  async function runItemAction(card, pendingText, action, doneText) {
    const status = card.querySelector('.media-item-status');
    const buttons = card.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    setStatus(status, pendingText);
    try {
      await action();
      setStatus(status, doneText, 'ok');
    } catch (err) {
      setStatus(status, errorText(err), 'err');
    } finally {
      buttons.forEach(b => { b.disabled = false; });
    }
  }

  // ── Audios ──

  function audioSource(audio) {
    // Los audios incluidos en la app también están en la carpeta audio/ de este panel.
    return audio.url || audio.file_path || '';
  }

  function renderAudioCard(audio) {
    const textInput = el('input', { type: 'text', value: audio.display_text || '', placeholder: 'Texto que muestra el robot' });
    const volumeInput = el('input', { type: 'number', min: 0, max: 1, step: 0.05, value: audio.default_volume, title: 'Volumen por defecto', className: 'media-short' });
    const activeInput = el('input', { type: 'checkbox', checked: audio.active });
    const overlayInput = el('input', { type: 'checkbox', checked: audio.show_overlay });
    const card = el('article', { className: `media-item${audio.active ? '' : ' inactive'}` });

    const save = el('button', { type: 'button', className: 'btn-accent', textContent: 'Guardar' });
    save.addEventListener('click', () => runItemAction(card, 'Guardando...', async () => {
      const updated = await RoboticsApi.catalog.audios.update(audio.id, {
        display_text: textInput.value.trim() || null,
        default_volume: Number(volumeInput.value),
        show_overlay: overlayInput.checked,
        active: activeInput.checked,
      });
      replaceAudio(updated);
    }, 'Guardado.'));

    const replace = el('button', { type: 'button', className: 'btn-outline', textContent: 'Reemplazar archivo' });
    replace.addEventListener('click', async () => {
      const file = await pickFile('.wav,.mp3,.ogg,.m4a,.aac,audio/*');
      if (!file) return;
      runItemAction(card, `Subiendo ${file.name}...`, async () => {
        replaceAudio(await RoboticsApi.catalog.audios.replaceFile(audio.id, file));
      }, 'Archivo reemplazado.');
    });

    card.append(
      el('div', { className: 'media-item-head' },
        el('span', { className: 'media-item-code', textContent: audio.code }),
        el('span', { className: 'media-chip', textContent: CATEGORIES[audio.category] || audio.category }),
        el('span', {
          className: `media-chip ${audio.url ? 'cloud' : 'bundled'}`,
          textContent: audio.url ? 'Cloudinary' : 'Incluido en la app',
          title: audio.url || audio.file_path,
        }),
      ),
      el('audio', { controls: true, preload: 'none', src: audioSource(audio) }),
      el('div', { className: 'media-row' }, textInput, volumeInput),
      el('div', { className: 'media-item-actions' },
        el('label', { className: 'toggle-label' }, activeInput, ' Activo'),
        el('label', { className: 'toggle-label' }, overlayInput, ' Texto'),
        replace,
        save,
      ),
      el('div', { className: 'media-item-status' }),
    );
    return card;
  }

  function renderAudios() {
    const list = document.getElementById('audioList');
    const query = document.getElementById('audioSearch').value.trim().toLowerCase();
    const category = document.getElementById('audioFilter').value;
    const visible = audios.filter(audio =>
      (!category || audio.category === category) &&
      (!query || audio.code.includes(query) || (audio.display_text || '').toLowerCase().includes(query)));

    list.replaceChildren(...(visible.length
      ? visible.map(renderAudioCard)
      : [el('p', { className: 'hint-text', textContent: audios.length ? 'Ningún audio coincide.' : 'No hay audios.' })]));
  }

  /** Mantiene la lista en memoria al día y vuelve a pintar. */
  function replaceAudio(updated) {
    const index = audios.findIndex(a => a.id === updated.id);
    if (index >= 0) audios[index] = updated;
    else audios.push(updated);
    renderAudios();
  }

  async function loadAudios() {
    try {
      audios = await RoboticsApi.catalog.audios.list();
      setBackendStatus(true, 'Backend');
      renderAudios();
    } catch (err) {
      setBackendStatus(false, 'Sin backend');
      document.getElementById('audioList').replaceChildren(el('p', { className: 'hint-text error-text', textContent: errorText(err) }));
    }
  }

  async function submitAudio(event) {
    event.preventDefault();
    const form = event.target;
    const status = form.querySelector('.media-form-status');
    const button = form.querySelector('button[type="submit"]');
    const file = form.elements.file.files[0];
    if (!file) return;

    button.disabled = true;
    setStatus(status, `Subiendo ${file.name}...`);
    try {
      const audio = await RoboticsApi.catalog.audios.upload(file, formFields(form));
      replaceAudio(audio);
      form.reset();
      setStatus(status, `Audio "${audio.code}" subido.`, 'ok');
    } catch (err) {
      setStatus(status, errorText(err), 'err');
    } finally {
      button.disabled = false;
    }
  }

  // ── Emociones ──

  function renderEmotionCard(emotion) {
    const labelInput = el('input', { type: 'text', value: emotion.label, maxLength: 40, placeholder: 'Nombre' });
    const subInput = el('input', { type: 'text', value: emotion.sub_label || '', maxLength: 60, placeholder: 'Descripción' });
    const iconInput = el('input', { type: 'text', value: emotion.icon || '', maxLength: 10, placeholder: 'Ícono', title: 'Ícono', className: 'media-short' });
    const orderInput = el('input', { type: 'number', value: emotion.sort_order, step: 1, title: 'Orden en el panel' });
    const activeInput = el('input', { type: 'checkbox', checked: emotion.active });
    const card = el('article', { className: `media-item${emotion.active ? '' : ' inactive'}` });

    // Los GIFs incluidos en la app solo existen en el robot: aquí se muestra su ícono.
    const preview = emotion.gif_url
      ? el('img', { className: 'media-thumb', src: emotion.gif_url, alt: emotion.label, loading: 'lazy' })
      : el('div', { className: 'media-thumb', textContent: emotion.icon || '🙂', title: emotion.gif_path });

    const save = el('button', { type: 'button', className: 'btn-accent', textContent: 'Guardar' });
    save.addEventListener('click', () => runItemAction(card, 'Guardando...', async () => {
      const updated = await RoboticsApi.catalog.emotions.update(emotion.id, {
        label: labelInput.value.trim(),
        sub_label: subInput.value.trim() || null,
        icon: iconInput.value.trim() || null,
        sort_order: Number(orderInput.value) || 0,
        active: activeInput.checked,
      });
      replaceEmotion(updated);
    }, 'Guardado.'));

    const replace = el('button', { type: 'button', className: 'btn-outline', textContent: 'Reemplazar' });
    replace.addEventListener('click', async () => {
      const file = await pickFile('.gif,.mp4,.webm,.mov,image/gif,video/*');
      if (!file) return;
      runItemAction(card, `Subiendo ${file.name}...`, async () => {
        replaceEmotion(await RoboticsApi.catalog.emotions.replaceFile(emotion.id, file));
      }, 'Archivo reemplazado.');
    });

    const source = emotion.gif_url
      ? (emotion.resource_type === 'video' ? 'Video → GIF' : 'Cloudinary')
      : 'Incluido en la app';

    card.append(
      preview,
      el('div', { className: 'media-item-head' },
        el('span', { className: 'media-item-code', textContent: emotion.code }),
        el('span', { className: `media-chip ${emotion.gif_url ? 'cloud' : 'bundled'}`, textContent: source }),
      ),
      el('div', { className: 'media-row' }, iconInput, orderInput),
      labelInput,
      subInput,
      el('div', { className: 'media-item-actions' },
        el('label', { className: 'toggle-label' }, activeInput, ' Activa'),
        replace,
        save,
      ),
      el('div', { className: 'media-item-status' }),
    );
    return card;
  }

  function renderEmotions() {
    const list = document.getElementById('emotionList');
    const sorted = [...emotions].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
    list.replaceChildren(...(sorted.length
      ? sorted.map(renderEmotionCard)
      : [el('p', { className: 'hint-text', textContent: 'No hay emociones.' })]));
  }

  function replaceEmotion(updated) {
    const index = emotions.findIndex(e => e.id === updated.id);
    if (index >= 0) emotions[index] = updated;
    else emotions.push(updated);
    renderEmotions();
  }

  async function loadEmotions() {
    try {
      emotions = await RoboticsApi.catalog.emotions.list({ includeInactive: true });
      renderEmotions();
    } catch (err) {
      document.getElementById('emotionList').replaceChildren(el('p', { className: 'hint-text error-text', textContent: errorText(err) }));
    }
  }

  async function submitEmotion(event) {
    event.preventDefault();
    const form = event.target;
    const status = form.querySelector('.media-form-status');
    const button = form.querySelector('button[type="submit"]');
    const file = form.elements.file.files[0];
    if (!file) return;

    button.disabled = true;
    const converting = file.type.startsWith('video/') ? ' (convirtiendo a GIF, puede tardar)' : '';
    setStatus(status, `Subiendo ${file.name}${converting}...`);
    try {
      const emotion = await RoboticsApi.catalog.emotions.upload(file, formFields(form));
      replaceEmotion(emotion);
      form.reset();
      setStatus(status, `Emoción "${emotion.code}" subida.`, 'ok');
    } catch (err) {
      setStatus(status, errorText(err), 'err');
    } finally {
      button.disabled = false;
    }
  }

  // ── Inicio ──

  function showTab(name) {
    document.querySelectorAll('.media-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
    document.querySelectorAll('.media-panel').forEach(panel => { panel.hidden = panel.id !== `tab-${name}`; });
    try { localStorage.setItem('rb_mediaTab', name); } catch { /* solo es una preferencia */ }
  }

  function init() {
    const options = Object.entries(CATEGORIES).map(([value, label]) => el('option', { value, textContent: label }));
    document.getElementById('audioCategory').replaceChildren(...options.map(o => o.cloneNode(true)));
    document.getElementById('audioFilter').replaceChildren(el('option', { value: '', textContent: 'Todas las categorías' }), ...options);

    document.querySelectorAll('.media-tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
    document.getElementById('audioSearch').addEventListener('input', renderAudios);
    document.getElementById('audioFilter').addEventListener('change', renderAudios);
    document.getElementById('audioForm').addEventListener('submit', submitAudio);
    document.getElementById('emotionForm').addEventListener('submit', submitEmotion);

    let saved = null;
    try { saved = localStorage.getItem('rb_mediaTab'); } catch { /* sin almacenamiento */ }
    showTab(saved === 'emotions' ? 'emotions' : 'audios');

    loadAudios();
    loadEmotions();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { reload: () => { loadAudios(); loadEmotions(); } };
})();
