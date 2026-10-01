/**
 * Panel generado desde robotics-backend:
 * - selector de robots (GET /api/robots), en lugar de las IPs fijas del HTML;
 * - emociones y secciones de botones (GET /api/panel), resueltas para el robot
 *   elegido y el comercio seleccionado;
 * - configuración del backend (URL + token del panel).
 *
 * Los comandos siguen yendo directo al robot (callEndpoint de app.js): el
 * backend solo dice QUÉ botones mostrar y qué audio usa cada uno.
 */
const PanelLayout = (() => {
  /** Robots tal como los devuelve el backend. */
  let robots = [];
  /** Texto que el robot muestra para cada archivo de audio (para el badge local). */
  let displayTextByFile = {};
  /** Robot + comercio de la última distribución dibujada, para no repetir la petición. */
  let renderedKey = null;
  /** Descarta respuestas viejas si el operador cambia de robot rápido. */
  let loadSequence = 0;

  // ── Estado del backend ──

  function setBackendStatus(state, detail = '') {
    const dot = document.getElementById('backendDot');
    const text = document.getElementById('backendText');
    if (!dot || !text) return;
    const labels = {
      ok: 'Backend',
      cache: 'Backend (copia)',
      offline: 'Backend offline',
      auth: 'Token inválido',
      unconfigured: 'Configurar backend',
    };
    dot.className = `dot ${state === 'ok' ? 'online' : state === 'cache' ? 'cached' : 'offline'}`;
    text.textContent = labels[state] || 'Backend';
    document.getElementById('backendStatus').title = detail || 'Configurar backend';
  }

  function showBackendSettings(show) {
    const panel = document.getElementById('backendSettings');
    if (!panel) return;
    panel.style.display = show ? 'flex' : 'none';
    if (show) {
      document.getElementById('backendUrlInput').value = RoboticsApi.config.getBackendUrl();
      document.getElementById('panelTokenInput').value = RoboticsApi.config.getPanelToken();
    }
  }

  function toggleBackendSettings() {
    const panel = document.getElementById('backendSettings');
    showBackendSettings(panel && panel.style.display === 'none');
  }

  async function saveBackendSettings() {
    const previousUrl = RoboticsApi.config.getBackendUrl();
    RoboticsApi.config.setBackendUrl(document.getElementById('backendUrlInput').value || RoboticsApi.config.DEFAULT_BACKEND_URL);
    RoboticsApi.config.setPanelToken(document.getElementById('panelTokenInput').value);
    if (RoboticsApi.config.getBackendUrl() !== previousUrl) RoboticsApi.http.clearCache();
    log(`Backend configurado: ${RoboticsApi.config.getBackendUrl()}`, 'info');
    renderedKey = null;
    const loaded = await loadRobots();
    if (loaded) showBackendSettings(false);
  }

  /** Traduce un error del backend en estado + mensaje. Devuelve true si hay que pedir el token. */
  function handleBackendError(err, what) {
    if (err.isUnauthorized) {
      setBackendStatus('auth', err.message);
      log(`Backend rechazó el token del panel al cargar ${what}. Revísalo en ⚙️.`, 'err');
      showBackendSettings(true);
      return true;
    }
    setBackendStatus('offline', err.message);
    log(`No se pudo cargar ${what} desde el backend: ${err.message}`, 'err');
    return false;
  }

  function reportCache(result, what) {
    if (result.fromCache) {
      const when = result.savedAt ? new Date(result.savedAt).toLocaleString('es-ES') : 'antes';
      setBackendStatus('cache', `Backend sin respuesta; usando copia del ${when}`);
      log(`Backend sin respuesta: ${what} desde la copia guardada (${when}).`, 'warn');
    } else {
      setBackendStatus('ok', RoboticsApi.config.getBackendUrl());
    }
  }

  // ── Robots ──

  function getSelectedRobot() {
    const select = document.getElementById('baseUrl');
    const code = select?.selectedOptions[0]?.dataset.code;
    return robots.find(robot => robot.code === code) || null;
  }

  function getSelectedRobotCode() {
    return getSelectedRobot()?.code || null;
  }

  function renderRobotOptions() {
    const select = document.getElementById('baseUrl');
    select.innerHTML = '';
    if (robots.length === 0) {
      select.add(new Option('Sin robots: configura el backend (⚙️)', ''));
      return;
    }
    for (const robot of robots) {
      const option = new Option(robot.name, robot.base_url);
      option.dataset.code = robot.code;
      select.add(option);
    }
    // Recuperar el robot elegido la última vez (app.js guarda su URL al conectar).
    let saved = null;
    try { saved = localStorage.getItem(LS_KEY_URL); } catch { /* sin almacenamiento */ }
    if (saved && robots.some(robot => robot.base_url === saved)) select.value = saved;
  }

  /** Carga los robots y luego los botones del robot elegido. Devuelve true si cargó. */
  async function loadRobots() {
    if (!RoboticsApi.config.getPanelToken()) {
      setBackendStatus('unconfigured');
      showBackendSettings(true);
      log('Ingresa la URL del backend y el token del panel (⚙️) para cargar los robots.', 'warn');
      return false;
    }
    try {
      const result = await RoboticsApi.robots.list();
      robots = result.data;
      reportCache(result, 'la lista de robots');
      renderRobotOptions();
      log(`${robots.length} robots cargados desde el backend.`, 'ok');
      await loadLayout({ force: true });
      return true;
    } catch (err) {
      handleBackendError(err, 'los robots');
      return false;
    }
  }

  // ── Distribución del panel ──

  /**
   * Pide al backend las emociones y secciones del robot elegido para el comercio
   * seleccionado (_selectedMerchantId de app.js) y las dibuja.
   */
  async function loadLayout({ force = false } = {}) {
    const robotCode = getSelectedRobotCode();
    if (!robotCode) return;
    const merchantId = typeof _selectedMerchantId !== 'undefined' ? _selectedMerchantId : null;
    const key = `${robotCode}|${merchantId ?? '-'}`;
    if (!force && key === renderedKey) return;

    const sequence = ++loadSequence;
    try {
      const result = await RoboticsApi.panel.get(robotCode, merchantId);
      if (sequence !== loadSequence) return; // llegó otra petición más nueva
      reportCache(result, 'los botones');
      renderedKey = key;
      renderEmotions(result.data.emotions);
      renderSections(result.data.sections);
    } catch (err) {
      if (sequence !== loadSequence) return;
      handleBackendError(err, 'los botones');
      document.getElementById('dynamicSections').innerHTML =
        '<p class="hint-text error-text">No se pudieron cargar los botones desde el backend.</p>';
    }
  }

  /** El texto que muestra el robot para un archivo de audio (ej: 'hello.wav'). */
  function labelFor(fileName) {
    return displayTextByFile[fileName] ?? null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function actionCard({ icon, label, subLabel, style }) {
    const card = el('button', `action-card${style && style !== 'normal' ? ` ${style}` : ''}`);
    card.type = 'button';
    if (icon) card.appendChild(el('span', 'action-card-icon', icon));
    card.appendChild(el('span', 'action-card-label', label));
    if (subLabel) card.appendChild(el('span', 'action-card-sub', subLabel));
    return card;
  }

  function renderEmotions(emotions) {
    const grid = document.getElementById('emotionGrid');
    grid.innerHTML = '';
    for (const emotion of emotions) {
      const card = actionCard({ icon: emotion.icon, label: emotion.label, subLabel: emotion.sub_label });
      card.addEventListener('click', () => setEmotion(emotion.code, emotion.gif_url));
      grid.appendChild(card);
    }
  }

  function sectionShell(section) {
    const block = el('section', 'block');
    block.dataset.section = section.code;
    const header = el('div', 'block-header');
    header.appendChild(el('span', 'block-icon', section.icon || '🔊'));
    header.appendChild(el('span', 'block-title', section.title));
    block.appendChild(header);
    return block;
  }

  function renderGrid(section) {
    const block = sectionShell(section);
    const grid = el('div', `action-grid${section.columns >= 3 ? ' cols-3' : ''}`);
    for (const button of section.buttons) {
      const card = actionCard({ icon: button.icon, label: button.label, subLabel: button.sub_label, style: button.style });
      card.addEventListener('click', () => runButton(button));
      grid.appendChild(card);
    }
    block.appendChild(grid);
    return block;
  }

  /** Secciones tipo lista (sirenas, Nexus Patio Tech): un select + volumen + reproducir. */
  function renderDropdown(section) {
    const block = sectionShell(section);
    const box = el('div', 'audio-custom');

    const selectRow = el('div', 'audio-custom-row');
    const select = el('select', 'alertas-select');
    select.add(new Option('-- Seleccionar sonido --', ''));
    section.buttons.forEach((button, index) => {
      select.add(new Option(`${button.icon ? `${button.icon} ` : ''}${button.label}`, String(index)));
    });
    selectRow.appendChild(select);

    const playRow = el('div', 'audio-custom-row split');
    const volume = el('input');
    volume.type = 'number';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.1';
    volume.value = '1.0';
    volume.title = 'Volumen (0 a 1)';
    const play = el('button', 'btn-play', '▶️');
    play.type = 'button';
    play.addEventListener('click', () => {
      if (select.value === '') {
        log('Selecciona un sonido de la lista', 'warn');
        return;
      }
      const parsed = parseFloat(volume.value);
      runButton(section.buttons[Number(select.value)], { volume: Number.isNaN(parsed) ? undefined : parsed });
    });
    playRow.appendChild(volume);
    playRow.appendChild(play);

    box.appendChild(selectRow);
    box.appendChild(playRow);
    block.appendChild(box);
    return block;
  }

  function renderSections(sections) {
    displayTextByFile = {};
    for (const section of sections) {
      for (const button of section.buttons) {
        if (button.audio?.display_text) {
          displayTextByFile[audioSource(button.audio).split('/').pop()] = button.audio.display_text;
        }
      }
    }

    const container = document.getElementById('dynamicSections');
    container.innerHTML = '';
    for (const section of sections) {
      container.appendChild(section.kind === 'dropdown' ? renderDropdown(section) : renderGrid(section));
    }
    if (sections.length === 0) {
      container.innerHTML = '<p class="hint-text">Este robot no tiene botones configurados.</p>';
    }
  }

  // ── Ejecución de un botón ──

  /**
   * Ejecuta un botón tal como lo hacían los botones fijos del HTML:
   * - quick_play: suena local + POST /audio/play en el robot (antes quickPlay / playAlertAudio).
   * - greet_with_audio: muestra el carrusel + audio (POST /greet/audio).
   * - endpoint: POST directo al endpoint del robot (/greet, /play-order, /audio/stop...).
   */
  /**
   * Ruta del audio: 'audio/x.wav' si viene incluido en la app (y en este panel), o la URL
   * de Cloudinary si se subió desde media.html. El robot recibe lo mismo en `asset`.
   */
  function audioSource(audio) {
    return audio.url || audio.file_path || '';
  }

  async function runButton(button, { volume } = {}) {
    const audio = button.audio;
    const source = audio ? audioSource(audio) : null;
    switch (button.action) {
      case 'quick_play': {
        playLocal(source);
        const result = await callEndpoint('POST', '/audio/play', {
          asset: source,
          volume: volume ?? audio.default_volume,
          force: button.force,
          displayText: audio.display_text,
          showOverlay: audio.show_overlay,
        });
        if (!result.ok) log('⚠️ Robot no reprodujo. Sonando solo local.', 'warn');
        return result;
      }
      case 'greet_with_audio':
        return greetWithAudio(source, source, {
          force: button.force,
          displayText: audio.display_text,
          showOverlay: audio.show_overlay,
        });
      case 'endpoint':
        if (button.endpoint === '/audio/stop') stopLocal();
        return callEndpoint('POST', button.endpoint, null, source);
      default:
        log(`Acción desconocida en el botón "${button.label}": ${button.action}`, 'err');
        return { ok: false };
    }
  }

  // ── Inicio ──

  function init() {
    const select = document.getElementById('baseUrl');
    select.addEventListener('change', () => {
      renderedKey = null;
      loadLayout();
    });
    document.getElementById('panelTokenInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') saveBackendSettings();
    });
    loadRobots();
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    getSelectedRobot,
    getSelectedRobotCode,
    loadRobots,
    loadLayout,
    labelFor,
    runButton,
    toggleBackendSettings,
    saveBackendSettings,
  };
})();
