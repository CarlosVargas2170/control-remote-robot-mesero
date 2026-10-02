/**
 * Control Remoto - Mini App QR
 * Panel de control para enviar comandos al robot.
 */

const LS_KEY_URL = 'rc_baseUrl';

// Los audios, sus textos y los botones vienen del backend (GET /api/panel);
// ver panel-layout.js. Los archivos siguen en audio/ para sonar en local.

// ── Helpers ──

function getBaseUrl() {
  const input = document.getElementById('baseUrl');
  let url = input.value.trim();
  if (!url) url = 'http://localhost:8080';
  localStorage.setItem(LS_KEY_URL, url);
  return url.replace(/\/$/, '');
}

function log(message, type = 'info') {
  const body = document.getElementById('logBody');
  if (!body) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

function clearLogs() {
  document.getElementById('logBody').innerHTML = '';
}

function setConnectionStatus(online) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  if (online) {
    dot.className = 'dot online';
    text.textContent = 'Online';
    text.style.color = 'var(--accent-emerald)';
  } else {
    dot.className = 'dot offline';
    text.textContent = 'Offline';
    text.style.color = 'var(--red)';
  }
}

let _ttsOnline = false;

/** Actualiza el indicador visual de disponibilidad del servicio TTS del robot. */
function setTtsStatus(online, offlineLabel = 'TTS Offline') {
  _ttsOnline = online;
  const dot = document.getElementById('ttsDot');
  const text = document.getElementById('ttsText');
  const btn = document.getElementById('btnTtsSend');
  if (!dot || !text) return;
  if (online) {
    dot.className = 'dot online';
    text.textContent = 'TTS Online';
    if (btn) btn.disabled = false;
  } else {
    dot.className = 'dot offline';
    text.textContent = offlineLabel;
    if (btn) btn.disabled = true;
  }
}

/** Verifica, a través del backend, el TTS asignado al robot seleccionado. */
async function checkTtsService() {
  setTtsStatus(false); // por defecto, offline hasta confirmar
  const robot = PanelLayout.getSelectedRobot();
  if (!robot) return;
  if (!robot.tts_available) {
    setTtsStatus(false, 'Sin TTS');
    log(`${robot.name} no tiene servicio TTS asignado.`, 'info');
    return;
  }
  try {
    const health = await RoboticsApi.tts.health(robot.code);
    if (health.status !== 'ok') {
      throw new Error(`Estado inesperado: ${health.status ?? 'desconocido'}`);
    }
    setTtsStatus(true);
    const gpuStatus = health.gpu ? 'GPU activa' : 'sin GPU';
    const speakers = health.speakers_loaded ?? 0;
    log(`Servicio TTS de ${robot.name} disponible (${gpuStatus}, speakers: ${speakers})`, 'ok');
  } catch (err) {
    setTtsStatus(false);
    log(`Servicio TTS no disponible: ${err.message}`, 'warn');
  }
}

// ── Audio local ──

let _currentLocalAudio = null;

/**
 * Reproduce un audio en el panel: un archivo de audio/ o una URL de Cloudinary.
 * @param {string} filePath
 * @param {string|null} label - Texto del badge; si falta, se deduce del archivo.
 */
function playLocal(filePath, label = null) {
  stopLocal();
  const audio = new Audio(filePath);

  // Mostrar badge visual
  showAudioBadge(filePath, label);

  // Ocultar badge cuando el audio termine naturalmente
  audio.addEventListener('ended', hideAudioBadge);
  audio.addEventListener('error', hideAudioBadge);

  audio.play().catch(e => {
    // AbortError = stopLocal() lo cortó antes de empezar (robot falló o en cooldown): ya se avisó.
    if (e.name !== 'AbortError') log(`Audio local: ${e.message}`, 'warn');
    hideAudioBadge();
  });
  _currentLocalAudio = audio;
  log(`🔊 Reproduciendo local: ${filePath}`, 'ok');
}

/** Detiene la reproduccion local activa. */
function stopLocal() {
  if (_currentLocalAudio) {
    _currentLocalAudio.pause();
    _currentLocalAudio.currentTime = 0;
    _currentLocalAudio = null;
    hideAudioBadge();
  }
}

// ── Badge visual de audio ──

/**
 * Muestra el badge de "audio en reproduccion". Usa el texto que da el botón; si no
 * hay (audio personalizado), lo deduce del archivo: "audio/question_coffe.wav" → "¿Quieres un café?".
 */
function showAudioBadge(filePath, label = null) {
  const badge = document.getElementById('audioLiveBadge');
  const text = document.getElementById('audioLiveText');
  if (!badge || !text) return;

  const fileName = filePath.includes('/') ? filePath.split('/').pop() : filePath;
  text.textContent = label
    || PanelLayout.labelFor(fileName)
    || fileName.replace(/\.(wav|mp3)$/, '').replace(/_/g, ' ');
  badge.style.display = 'flex';
}

/** Oculta el badge de audio. */
function hideAudioBadge() {
  const badge = document.getElementById('audioLiveBadge');
  if (badge) badge.style.display = 'none';
}

// ── Core ──

/** Endpoints que muestran o inician la interaccion con el carrusel. */
const MERCHANT_REQUIRED_ENDPOINTS = new Set([
  '/greet',
  '/greet/audio',
  '/product',
  '/play-question',
]);

/** Impide usar el carrusel hasta confirmar un merchant en el backend. */
function requireSelectedMerchant() {
  if (_selectedMerchantId === null) {
    log('Primero debes seleccionar un comercio antes de mostrar el carrusel.', 'warn');
    return false;
  }

  if (_isToggling) {
    log('Espera a que termine la seleccion del comercio.', 'warn');
    return false;
  }

  return true;
}

/**
 * Llama a un endpoint del robot.
 * @param {string} method - GET, POST, PUT, etc.
 * @param {string} path - Ruta del endpoint (ej: '/greet').
 * @param {Object|null} body - Body de la peticion (solo POST/PUT).
 * @param {string|null} localAudioFile - Audio que suena en el panel a la vez; se corta si el
 *   robot falla o no lo reproduce (cooldown).
 * @param {string|null} localAudioLabel - Texto del badge de ese audio.
 */
async function callEndpoint(method, path, body = null, localAudioFile = null, localAudioLabel = null) {
  const endpointPath = String(path).split('?')[0];
  if (MERCHANT_REQUIRED_ENDPOINTS.has(endpointPath) && !requireSelectedMerchant()) {
    return { ok: false, error: 'merchant_required' };
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  log(`${method} ${path} ...`, 'info');

  const options = {
    method,
    headers: { 'Accept': 'application/json' },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  // Reproducir local ANTES del fetch para que suene sincronizado con el robot
  if (localAudioFile) {
    playLocal(localAudioFile, localAudioLabel);
  }

  try {
    const res = await fetch(url, options);
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }

    if (res.ok) {
      setConnectionStatus(true);

      if(path === '/products' ||path ==='/products/filter'){
        log(`OK ${res.status} → productos obtenidos`, 'ok');
      }else{
        log(`OK ${res.status} → ${JSON.stringify(data)}`, 'ok');
      }


      // Si el robot no reprodujo por cooldown, cortar el audio local también
      if (localAudioFile && data && data.played === false) {
        stopLocal();
        log('⚠️ Robot en cooldown. Audio local detenido.', 'warn');
      }
    } else {
      setConnectionStatus(false);
      log(`ERR ${res.status} → ${JSON.stringify(data)}`, 'err');
      stopLocal(); // Rollback: el robot NO está reproduciendo, cortar audio local
      if (localAudioFile) log(`⚠️ El robot rechazó el audio (ERR ${res.status}): audio local detenido.`, 'warn');
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    setConnectionStatus(false);
    log(`NET ERR: ${err.message}`, 'err');
    stopLocal(); // Rollback: sin conexión, cortar audio local
    if (localAudioFile) log('⚠️ Robot sin conexión: audio local detenido.', 'warn');
    return { ok: false, error: err.message };
  }
}

/** Cambia la cara del robot. `url` solo viene en los GIFs subidos desde media.html (Cloudinary). */
async function setEmotion(emotion, url = null) {
  const body = { gif: emotion };
  if (url) body.url = url;
  await callEndpoint('POST', '/attract/set', body);
}

async function testConnection() {
  log('Probando conexion...', 'info');
  const result = await callEndpoint('GET', '/config');
  if (result.ok) {
    const cfg = result.data?.data || {};
    const merchants = cfg.merchantIds || [];
    log(`Conectado! Merchants=${merchants.join(',')}, Product=${cfg.productId}`, 'ok');
    // Exigir una seleccion explicita en cada nueva conexion. El merchant que
    // venga habilitado desde el backend no se considera seleccionado en la UI.
    _selectedMerchantId = null;
    _productState = null;
    _pendingProductIds.clear();
    updateMerchantAudioSections();
    await loadMerchantsAndProducts();
    // Empezar a observar el estado de polling del robot
    startPollingStatusWatcher();
    refreshPollingStatus();
    // Verificar también el servicio TTS
    checkTtsService();
  } else {
    stopPollingStatusWatcher();
    updatePollingStatusUI({ phase: 'idle', isPolling: false, label: 'Sin conexión' });
  }
}

// ── Polling status (sincronizado con la app Flutter) ──

let _pollingStatusTimer = null;
const POLLING_STATUS_INTERVAL_MS = 2000;

/** Arranca el watcher que consulta GET /payment/polling-status. */
function startPollingStatusWatcher() {
  stopPollingStatusWatcher();
  _pollingStatusTimer = setInterval(refreshPollingStatus, POLLING_STATUS_INTERVAL_MS);
}

function stopPollingStatusWatcher() {
  if (_pollingStatusTimer) {
    clearInterval(_pollingStatusTimer);
    _pollingStatusTimer = null;
  }
}

/** Consulta el estado real del polling en el robot y actualiza la UI. */
async function refreshPollingStatus() {
  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/payment/polling-status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      updatePollingStatusUI({
        phase: 'idle',
        isPolling: false,
        label: 'Estado no disponible',
      });
      return;
    }
    const data = await res.json();
    updatePollingStatusUI(data);
  } catch (_) {
    // Silencioso: no spamear la consola cada 2s si hay desconexión breve
  }
}

/**
 * Pinta el badge de estado de polling.
 * @param {Object} data - Respuesta de GET /payment/polling-status
 */
function updatePollingStatusUI(data) {
  const card = document.getElementById('pollingStatusCard');
  const labelEl = document.getElementById('pollingStatusLabel');
  const detailEl = document.getElementById('pollingStatusDetail');
  const btnStart = document.getElementById('btnStartPolling');
  const btnStop = document.getElementById('btnStopPolling');
  if (!card || !labelEl || !detailEl) return;

  const phase = data.phase || (data.isPolling ? 'polling' : 'idle');
  const label = data.label || (data.isPolling ? 'Polling activo' : 'Polling detenido');

  card.dataset.phase = phase;
  labelEl.textContent = label;

  // Detalle: producto / orden / merchant
  const parts = [];
  if (data.productName) parts.push(data.productName);
  if (data.productId != null) parts.push(`prod #${data.productId}`);
  if (data.merchantId != null) parts.push(`m #${data.merchantId}`);
  if (data.orderId != null) parts.push(`orden #${data.orderId}`);
  if (data.amount != null) parts.push(`Bs ${Number(data.amount).toFixed(2)}`);
  detailEl.textContent = parts.length
    ? parts.join(' · ')
    : (phase === 'idle' ? 'Sin producto activo en pantalla' : '—');

  // Resalta el botón relevante
  if (btnStart && btnStop) {
    btnStart.classList.toggle('is-active-hint', !data.isPolling);
    btnStop.classList.toggle('is-active-hint', data.isPolling);
  }

  // Actualizar contador de ventas
  if (data.counter) {
    updateSalesCounter(data.counter);
  }
}

/** Pinta el contador de ventas en la UI. */
function updateSalesCounter(counter) {
  const numberEl = document.getElementById('salesCounterNumber');
  const amountEl = document.getElementById('salesCounterAmount');
  const byProductEl = document.getElementById('salesByProduct');
  const lastTimeEl = document.getElementById('salesLastTime');

  if (numberEl) numberEl.textContent = counter.totalSales ?? 0;
  if (amountEl) amountEl.textContent = `Bs ${Number(counter.totalAmount || 0).toFixed(2)}`;

  if (byProductEl) {
    const products = counter.byProduct || [];
    if (products.length === 0) {
      byProductEl.innerHTML = '';
      byProductEl.style.display = 'none';
    } else {
      const items = products
        .map(p => `<span class="sales-product-tag">${escHtml(p.name)} x${p.count}</span>`)
        .join('');
      byProductEl.innerHTML = items;
      byProductEl.style.display = 'flex';
    }
  }

  // Hora de la última venta
  if (lastTimeEl) {
    const recent = counter.recent || [];
    if (recent.length > 0) {
      const d = new Date(recent[0].time);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      lastTimeEl.textContent = `Última: ${hh}:${mm}:${ss}`;
      lastTimeEl.style.display = 'block';
    } else {
      lastTimeEl.style.display = 'none';
    }
  }
}


/** Inicia polling en el robot y refresca el badge al instante. */
async function startPolling() {
  const result = await callEndpoint('POST', '/payment/start-polling');
  // La app tarda un tick en publicar; refrescar ya + un poco después
  refreshPollingStatus();
  setTimeout(refreshPollingStatus, 400);
  setTimeout(refreshPollingStatus, 1200);
  if (result.ok) {
    log('Comando: iniciar polling enviado', 'ok');
  }
}

/** Detiene polling en el robot y refresca el badge. */
async function stopPolling() {
  const result = await callEndpoint('POST', '/payment/stop-polling');
  refreshPollingStatus();
  setTimeout(refreshPollingStatus, 400);
  setTimeout(refreshPollingStatus, 1200);
  if (result.ok) {
    log('Comando: detener polling enviado', 'ok');
  }
}

/** Muestra el carrusel desde el primer producto y reproduce un audio.
 *  El asset debe existir en assets/audio/ dentro de mini-app-qr.
 *  @param {string} assetPath - Ruta del asset en el robot.
 *  @param {string} localPath - Copia local usada para oír el audio en el panel.
 *  @param {Object} options - Opciones force, displayText, showOverlay y label (texto del badge).
 */
async function greetWithAudio(assetPath, localPath, options = {}) {
  // Validar antes de reproducir el audio local para evitar una reproduccion
  // parcial cuando todavia no se confirmo el comercio.
  if (!requireSelectedMerchant()) {
    return { ok: false, error: 'merchant_required' };
  }

  const asset = String(assetPath || '').trim();
  if (!asset) {
    log('Selecciona una ruta de audio para mostrar el carrusel', 'warn');
    return { ok: false, error: 'asset_required' };
  }

  const fileName = asset.includes('/') ? asset.split('/').pop() : asset;
  const displayText = options.displayText ?? PanelLayout.labelFor(fileName);
  const params = new URLSearchParams({ asset });

  if (options.force === true) params.set('force', 'true');
  if (displayText) params.set('displayText', displayText);
  if (options.showOverlay === false) params.set('showOverlay', 'false');

  if (localPath) playLocal(localPath, options.label ?? displayText);

  const result = await callEndpoint('POST', `/greet/audio?${params.toString()}`);
  if (!result.ok) {
    log('⚠️ No se pudo mostrar el carrusel con el audio seleccionado: audio local detenido.', 'warn');
    return result;
  }

  if (result.data?.audio === false) {
    stopLocal();
    log('⚠️ Robot en cooldown. Audio local detenido.', 'warn');
  }

  return result;
}

async function playCustomAudio() {
  const asset = document.getElementById('customAsset').value.trim();
  const volume = parseFloat(document.getElementById('customVolume').value) || 1.0;
  const force = document.getElementById('customForce').checked;
  const displayText = document.getElementById('customDisplayText')?.value?.trim() || null;

  if (!asset) {
    log('Escribe la ruta del asset de audio', 'warn');
    return;
  }

  // Extraer solo el nombre del archivo (ej: "audio/alerta.wav" → "alerta.wav")
  const fileName = asset.includes('/') ? asset.split('/').pop() : asset;
  const localFile = `audio/${fileName}`;

  // Reproducir local ANTES del endpoint (sincronía)
  playLocal(localFile);

  const result = await callEndpoint('POST', '/audio/play', {
    asset,
    volume,
    force,
    displayText: displayText,
  });
  // No se pasa localFile a callEndpoint: playLocal ya se ejecutó arriba.
  // Si el endpoint falla, callEndpoint NO hará rollback (porque no recibió localAudioFile)
  // así que el audio local sigue sonando como fallback.
  if (!result.ok) {
    log('⚠️ No se pudo reproducir en el robot. Sonando solo localmente.', 'warn');
  }
}

/** Usa el asset escrito en Audio personalizado y muestra también el carrusel. */
async function playCustomGreeting() {
  const asset = document.getElementById('customAsset').value.trim();
  const force = document.getElementById('customForce').checked;
  const displayText = document.getElementById('customDisplayText')?.value?.trim() || null;

  if (!asset) {
    log('Escribe la ruta del asset de audio', 'warn');
    return;
  }

  const localPath = asset.replace(/\\/g, '/').replace(/^assets\//, '');
  await greetWithAudio(asset, localPath, {
    force,
    displayText,
  });
}

/** Alias conservado para enviar el texto exclusivamente al servicio TTS. */
async function sendConsoleText() {
  // La llamada a /audio/play de mini-app-qr queda desactivada.
  // Todo texto se envía exclusivamente al servicio TTS.
  return sendToServiceVoice();
}

const TTS_SAMPLE_RATE = 24000;
const TTS_PREBUFFER_SECONDS = 0.15;

function concatBytes(first, second) {
  const result = new Uint8Array(first.length + second.length);
  result.set(first, 0);
  result.set(second, first.length);
  return result;
}

/** Reproduce un stream PCM float32 little-endian, mono, a 24000 Hz. */
async function playTtsStream(response, audioContext) {
  if (!response.body) {
    throw new Error('El navegador no soporta streaming para esta respuesta');
  }
  const reader = response.body.getReader();
  let nextStartTime = audioContext.currentTime + TTS_PREBUFFER_SECONDS;
  let leftoverBytes = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      // Una muestra float32 ocupa 4 bytes. Se conserva cualquier resto para
      // unirlo con el siguiente chunk del stream.
      const combined = concatBytes(leftoverBytes, value);
      const usableLength = combined.length - (combined.length % 4);
      leftoverBytes = combined.slice(usableLength);

      if (usableLength === 0) continue;

      const samples = new Float32Array(
        combined.buffer,
        combined.byteOffset,
        usableLength / 4,
      );
      const audioBuffer = audioContext.createBuffer(
        1,
        samples.length,
        TTS_SAMPLE_RATE,
      );
      audioBuffer.copyToChannel(samples, 0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const startTime = Math.max(nextStartTime, audioContext.currentTime);
      source.start(startTime);
      nextStartTime = startTime + audioBuffer.duration;
    }

    if (leftoverBytes.length > 0) {
      log(`TTS: se descartaron ${leftoverBytes.length} bytes incompletos`, 'warn');
    }

    // El stream ya terminó, pero pueden quedar chunks programados sonando.
    const remainingMs = Math.max(
      0,
      (nextStartTime - audioContext.currentTime) * 1000,
    );
    await new Promise(resolve => window.setTimeout(resolve, remainingMs));
  } finally {
    reader.releaseLock();
    await audioContext.close();
  }
}

/**
 * Envía el texto del textarea al servicio de síntesis de voz (TTS).
 * Reproduce en el navegador el stream PCM devuelto por el servicio.
 */
async function sendToServiceVoice() {
  const textarea = document.getElementById('textInput');
  const text = textarea?.value?.trim();
  let audioContext = null;

  if (!text) {
    log('Escribe un texto antes de enviar', 'warn');
    return;
  }

  const robotCode = PanelLayout.getSelectedRobotCode();
  if (!_ttsOnline || !robotCode) {
    log('Servicio TTS no disponible. Conecta primero.', 'warn');
    return;
  }

  // Debe crearse y activarse durante el clic del usuario. Si se crea después
  // del fetch, Chrome puede bloquearlo por su política de autoplay.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    log('Web Audio API no está disponible en este navegador', 'err');
    return;
  }

  audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (audioContext.state !== 'running') {
    await audioContext.close();
    log(`No se pudo activar el audio del navegador (${audioContext.state})`, 'err');
    return;
  }

  log(`Enviando texto al servicio TTS: "${text}"`, 'info');
  log(`Audio del navegador activo a ${audioContext.sampleRate} Hz`, 'info');

  try {
    // El backend llama al TTS del robot con su token y devuelve el mismo stream PCM.
    const res = await RoboticsApi.tts.synthesize(robotCode, text);
    await playTtsStream(res, audioContext);
    log('Texto enviado y audio TTS reproducido correctamente', 'ok');
    textarea.value = '';
  } catch (err) {
    log(`ERR TTS: ${err.message}`, 'err');
  } finally {
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close();
    }
  }
}

// ── Config ──

async function updateConfig() {
  const body = {};
  const baseUrl = document.getElementById('cfgBaseUrl').value.trim();
  const token = document.getElementById('cfgToken').value.trim();
  const merchantIdsRaw = document.getElementById('cfgMerchantIds').value.trim();
  const productId = document.getElementById('cfgProductId').value;

  if (baseUrl) body.baseUrl = baseUrl;
  if (token) body.bearerToken = token;

  // Parsear merchantIds: "1,53,55" → [1, 53, 55]
  if (merchantIdsRaw) {
    const ids = merchantIdsRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (ids.length > 0) body.merchantIds = ids;
  }
  if (productId) body.productId = parseInt(productId);

  if (Object.keys(body).length === 0) {
    log('Nada que actualizar. Rellena al menos un campo.', 'warn');
    return;
  }

  const result = await callEndpoint('POST', '/config', body);
  if (result.ok) {
    log('Configuracion guardada. Recargando productos...', 'ok');
    loadMerchantsAndProducts();
  }
}

// ── Merchants & Products ──

/** Cache local del estado de productos cargado desde el backend. */
let _productState = null;
/** Modo de filtro actual. */
let _currentFilterMode = 'all';
/** Indica si hay una operacion de toggle en progreso. */
let _isToggling = false;
/** Merchant seleccionado actualmente en el menu desplegable. */
let _selectedMerchantId = null;
/** IDs de productos con cambios locales aun no enviados. */
const _pendingProductIds = new Set();

/** Configuracion del filtro automatico para el merchant Kiky. */
const KIKY_MERCHANT_ID = '1';
const KIKY_VISIBLE_PRODUCT_IDS = new Set(['489150', '489161']);

/** Vuelve a pedir los botones al backend para el comercio seleccionado. */
function updateMerchantAudioSections() {
  PanelLayout.loadLayout();
}

/**
 * Guarda en el backend el filtro aplicado al robot, para que lo recupere al
 * reiniciarse. Si falla, el filtro ya quedó aplicado en el robot: solo se avisa.
 */
async function persistProductFilter(changes) {
  const robotCode = PanelLayout.getSelectedRobotCode();
  if (!robotCode) return;
  try {
    await RoboticsApi.productFilter.save(robotCode, changes);
    log('Filtro guardado en el backend.', 'ok');
  } catch (err) {
    log(`El filtro se aplicó en el robot, pero no se guardó en el backend: ${err.message}`, 'warn');
  }
}

/**
 * Carga la lista de productos desde GET /products y renderiza la UI.
 */
async function loadMerchantsAndProducts() {
  if (_pendingProductIds.size > 0 && !_isToggling) {
    log('Guarda los filtros pendientes antes de volver a cargar productos.', 'warn');
    return;
  }

  const merchantContainer = document.getElementById('merchantList');
  const productContainer = document.getElementById('productList');
  if (merchantContainer) merchantContainer.innerHTML = '<p class="hint-text">Cargando merchants...</p>';
  if (productContainer) productContainer.innerHTML = '<p class="hint-text">Cargando productos...</p>';

  const result = await callEndpoint('GET', '/products');

  if (!result.ok) {
    _productState = null;
    _pendingProductIds.clear();
    if (merchantContainer) merchantContainer.innerHTML = '<p class="hint-text error-text">Error al cargar merchants</p>';
    if (productContainer) productContainer.innerHTML = '<p class="hint-text error-text">Error al cargar productos</p>';
    updateHeaderCount(0, 0);
    return;
  }

  const data = result.data;
  if (!data.cacheLoaded || !data.data) {
    _productState = null;
    _pendingProductIds.clear();
    if (merchantContainer) merchantContainer.innerHTML = '<p class="hint-text">No hay productos cargados. Pulsa Conectar cuando la app este iniciada.</p>';
    if (productContainer) productContainer.innerHTML = '<p class="hint-text">Carga productos primero</p>';
    updateHeaderCount(0, 0);
    return;
  }

  _productState = data.data;
  _pendingProductIds.clear();
  _currentFilterMode = _productState.filterMode || 'all';
  const merchants = Array.isArray(_productState.merchants) ? _productState.merchants : [];
  const selectedStillExists = _selectedMerchantId !== null &&
    merchants.some(m => String(m.merchantId) === _selectedMerchantId);
  if (!selectedStillExists) {
    _selectedMerchantId = null;
  }

  const selectedMerchant = merchants.find(m => String(m.merchantId) === _selectedMerchantId);
  updateMerchantAudioSections();
  updateFilterModeButtons();
  renderMerchantList(merchants);
  renderProductList(merchants);
  updateHeaderCount(
    selectedMerchant?.productCount ?? selectedMerchant?.products?.length ?? 0,
    selectedMerchant?.visibleCount ?? selectedMerchant?.products?.filter(p => p.visible).length ?? 0
  );
}

/** Renderiza un menu para seleccionar un unico merchant. */
function renderMerchantList(merchants) {
  const container = document.getElementById('merchantList');
  if (!container) return;

  if (!merchants || merchants.length === 0) {
    container.innerHTML = '<p class="hint-text">No hay merchants configurados</p>';
    return;
  }

  const selected = merchants.find(m => String(m.merchantId) === _selectedMerchantId);
  const options = merchants.map(m => {
    const id = String(m.merchantId);
    return `<option value="${escHtml(id)}" ${id === _selectedMerchantId ? 'selected' : ''}>[${escHtml(id)}] ${escHtml(m.merchantName)}</option>`;
  }).join('');
  const placeholder = `<option value="" disabled ${_selectedMerchantId === null ? 'selected' : ''}>Selecciona un comercio</option>`;

  container.innerHTML = `
    <div class="merchant-picker">
      <span class="merchant-picker-icon" aria-hidden="true">🏪</span>
      <div class="merchant-picker-body">
        <label class="merchant-select-label" for="merchantSelect">Seleccionar comercio</label>
        <div class="merchant-select-wrap">
          <select id="merchantSelect" class="merchant-select" onchange="toggleMerchant(this.value, this)" ${_isToggling ? 'disabled' : ''}>
            ${placeholder}${options}
          </select>
        </div>
      </div>
    </div>
    <div class="merchant-selection-status">
      ${selected
        ? `<span class="merchant-status-dot"></span><strong>${selected.visibleCount ?? 0}</strong> de ${selected.productCount ?? selected.products?.length ?? 0} productos visibles`
        : 'Debes seleccionar un comercio para continuar'}
    </div>`;
}

/** Renderiza la lista de productos agrupados por merchant. */
function renderProductList(merchants) {
  const container = document.getElementById('productList');
  if (!container) return;

  const selectedMerchant = merchants?.find(m => String(m.merchantId) === _selectedMerchantId);
  if (!selectedMerchant) {
    container.innerHTML = '<p class="hint-text">Selecciona un comercio para mostrar sus productos</p>';
    return;
  }

  if (!selectedMerchant.products || selectedMerchant.products.length === 0) {
    container.innerHTML = '<p class="hint-text">El merchant seleccionado no tiene productos</p>';
    return;
  }

  const colors = [
    '#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f0883e', '#39d2c0',
    '#f85149', '#8b949e'
  ];
  let colorIdx = 0;
  let html = '';

  for (const m of [selectedMerchant]) {
    if (!m.products || m.products.length === 0) continue;
    const dotColor = colors[colorIdx % colors.length];
    colorIdx++;

    html += `
      <div class="merchant-group-header">
        <span class="merchant-group-dot" style="background:${dotColor}"></span>
        [${m.merchantId}] ${escHtml(m.merchantName)}
        <span style="margin-left:auto;font-weight:400;font-size:9px">${m.visibleCount}/${m.productCount}</span>
      </div>`;

    for (const p of m.products) {
      const hidden = !p.visible;
      const pinned = p.pinned;
      const cls = hidden ? 'hidden' : '';
      html += `
        <div class="product-item ${cls}" id="prod-${p.id}">
          <label class="toggle-switch" title="${hidden ? 'Mostrar' : 'Ocultar'}">
            <input type="checkbox" ${!hidden ? 'checked' : ''} onchange="toggleProduct(${p.id}, this)">
            <span class="toggle-slider"></span>
          </label>
          <span class="product-name">${escHtml(p.name)}- ID: ${escHtml(p.id)}</span>
          <span class="product-price">$${p.price.toFixed(2)}</span>
          <button class="pin-btn ${pinned ? 'pinned' : ''}" title="${pinned ? 'Desfijar' : 'Fijar (siempre visible)'}" onclick="togglePinProduct(${p.id}, ${!pinned}, this)">📌</button>
        </div>`;
    }
  }

  html += `
    <div style="display:flex;gap:4px;margin-top:8px">
      <button id="btnSaveFilters" class="btn-sm success" style="flex:1" onclick="saveFilters()" ${_pendingProductIds.size === 0 || _isToggling ? 'disabled' : ''}>
        ${_pendingProductIds.size > 0 ? `Guardar filtros (${_pendingProductIds.size})` : 'Sin cambios pendientes'}
      </button>
    </div>`;
  container.innerHTML = html;
}

/** Retorna el merchant que se esta editando actualmente. */
function getSelectedMerchant() {
  const merchants = Array.isArray(_productState?.merchants) ? _productState.merchants : [];
  return merchants.find(m => String(m.merchantId) === _selectedMerchantId) ?? null;
}

/** Recalcula contadores y vuelve a pintar el borrador local de productos. */
function renderPendingProductChanges() {
  const merchant = getSelectedMerchant();
  if (!merchant) return;

  merchant.productCount = merchant.products?.length ?? 0;
  merchant.visibleCount = merchant.products?.filter(p => p.visible).length ?? 0;
  _currentFilterMode = 'blacklist';
  updateFilterModeButtons();
  renderMerchantList(_productState.merchants);
  renderProductList(_productState.merchants);
  updateHeaderCount(merchant.productCount, merchant.visibleCount);
}

/** Actualiza el contador en el header de Productos. */
function updateHeaderCount(total, visible) {
  const badge = document.getElementById('filterModeBadge');
  if (badge) badge.textContent = `${_currentFilterMode.toUpperCase()} · ${visible}/${total}`;
}

/** Habilita solo el merchant seleccionado y deshabilita todos los demas. */
async function toggleMerchant(merchantId, select) {
  if (_isToggling || !_productState) {
    if (select) select.value = _selectedMerchantId ?? '';
    return;
  }
  if (_pendingProductIds.size > 0) {
    if (select) select.value = _selectedMerchantId ?? '';
    log('Guarda los filtros pendientes antes de cambiar de merchant.', 'warn');
    return;
  }

  const merchants = Array.isArray(_productState.merchants) ? _productState.merchants : [];
  const selectedId = String(merchantId);
  if (!merchants.some(m => String(m.merchantId) === selectedId)) {
    if (select) select.value = _selectedMerchantId ?? '';
    return;
  }

  const previousMerchantId = _selectedMerchantId;
  _isToggling = true;
  _selectedMerchantId = selectedId;
  if (select) select.disabled = true;

  const merchantMap = {};
  for (const merchant of merchants) {
    const id = String(merchant.merchantId);
    merchantMap[id] = { enabled: id === selectedId };
  }

  const filterPayload = {
    merchants: merchantMap,
    reload: true
  };

  // Al seleccionar Kiky, dejar visibles unicamente Brownie y Cremoso 3 Leches.
  // if (selectedId === KIKY_MERCHANT_ID) {
  if (selectedId === 2) {
    const kikyMerchant = merchants.find(
      merchant => String(merchant.merchantId) === KIKY_MERCHANT_ID
    );
    const kikyProducts = Array.isArray(kikyMerchant?.products) ? kikyMerchant.products : [];
    const availableProductIds = new Set(kikyProducts.map(product => String(product.id)));
    const missingProductIds = [...KIKY_VISIBLE_PRODUCT_IDS].filter(
      productId => !availableProductIds.has(productId)
    );

    if (missingProductIds.length > 0) {
      _selectedMerchantId = previousMerchantId;
      _isToggling = false;
      if (select) {
        select.value = previousMerchantId ?? '';
        select.disabled = false;
      }
      log(`ERR: No se aplico el filtro de Kiky. Productos faltantes: ${missingProductIds.join(', ')}`, 'err');
      return;
    }

    filterPayload.filterMode = 'blacklist';
    filterPayload.products = Object.fromEntries(
      kikyProducts.map(product => {
        const visible = KIKY_VISIBLE_PRODUCT_IDS.has(String(product.id));
        return [String(product.id), { visible, pinned: visible }];
      })
    );
  }

  log(`Seleccionando merchant ${selectedId}...`, 'info');
  const result = await callEndpoint('POST', '/products/filter', filterPayload);

  if (result.ok) {
    log(`OK: Merchant ${selectedId} habilitado`, 'ok');
    persistProductFilter({ selectedMerchantId: Number(selectedId) });
    await new Promise(resolve => setTimeout(resolve, 800));
    await loadMerchantsAndProducts();
  } else {
    _selectedMerchantId = previousMerchantId;
    if (select) select.value = previousMerchantId ?? '';
    log(`ERR: No se pudo habilitar el merchant ${selectedId}`, 'err');
  }
  _isToggling = false;
  const currentSelect = document.getElementById('merchantSelect');
  if (currentSelect) currentSelect.disabled = false;
}

/** Actualiza localmente la visibilidad; Guardar filtros envia todos los cambios. */
function toggleProduct(productId, checkbox) {
  if (_isToggling) { checkbox.checked = !checkbox.checked; return; }
  const merchant = getSelectedMerchant();
  const product = merchant?.products?.find(p => String(p.id) === String(productId));
  if (!product) {
    checkbox.checked = !checkbox.checked;
    return;
  }

  product.visible = checkbox.checked;
  if (!product.visible) product.pinned = false;
  _pendingProductIds.add(String(productId));
  log(`Producto ${productId}: cambio pendiente (${product.visible ? 'visible' : 'oculto'})`, 'info');
  renderPendingProductChanges();
}

/** Actualiza localmente el fijado; Guardar filtros envia todos los cambios. */
function togglePinProduct(productId, pinned, btn) {
  if (_isToggling) return;
  const merchant = getSelectedMerchant();
  const product = merchant?.products?.find(p => String(p.id) === String(productId));
  if (!product) return;

  product.pinned = pinned;
  if (pinned) product.visible = true;
  _pendingProductIds.add(String(productId));
  log(`Producto ${productId}: cambio pendiente (${pinned ? 'fijado' : 'desfijado'})`, 'info');
  renderPendingProductChanges();
}

/** Cambia el modo de filtro con loading state y auto-refresh. */
async function setFilterMode(mode) {
  if (_isToggling) return;
  if (_pendingProductIds.size > 0) {
    log('Guarda los filtros pendientes antes de cambiar el modo.', 'warn');
    return;
  }
  _isToggling = true;
  _currentFilterMode = mode;
  updateFilterModeButtons();

  log(`Cambiando modo de filtro a: ${mode}...`, 'info');
  const result = await callEndpoint('POST', '/products/filter', {
    filterMode: mode,
    reload: true
  });

  if (result.ok) {
    log(`OK: Modo de filtro: ${mode}`, 'ok');
    persistProductFilter({ filterMode: mode });
    setTimeout(() => loadMerchantsAndProducts(), 800);
  } else {
    log(`ERR: No se pudo cambiar el modo de filtro`, 'err');
  }
  _isToggling = false;
}

/** Actualiza los botones de modo de filtro visualmente. */
function updateFilterModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === _currentFilterMode);
  });
}

/** Envia en una sola peticion el estado de todos los productos seleccionados. */
async function saveFilters() {
  if (_isToggling || !_productState) {
    log('No hay productos cargados', 'warn');
    return;
  }
  if (_pendingProductIds.size === 0) {
    log('No hay cambios de productos pendientes.', 'info');
    return;
  }

  const merchant = getSelectedMerchant();
  if (!merchant?.products?.length) {
    log('El merchant seleccionado no tiene productos.', 'warn');
    return;
  }

  const products = {};
  for (const product of merchant.products) {
    products[String(product.id)] = {
      visible: product.visible === true,
      pinned: product.pinned === true
    };
  }

  _isToggling = true;
  const saveButton = document.getElementById('btnSaveFilters');
  const merchantSelect = document.getElementById('merchantSelect');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando...';
  }
  if (merchantSelect) merchantSelect.disabled = true;

  log(`Guardando ${_pendingProductIds.size} cambio(s) de productos...`, 'info');
  const result = await callEndpoint('POST', '/products/filter', {
    products,
    filterMode: 'blacklist',
    reload: true
  });

  if (result.ok) {
    _pendingProductIds.clear();
    _currentFilterMode = 'blacklist';
    log('Filtros de productos aplicados correctamente.', 'ok');
    await persistProductFilter({
      filterMode: 'blacklist',
      products: merchant.products.map(product => ({
        id: product.id,
        merchantId: merchant.merchantId,
        visible: product.visible === true,
        pinned: product.pinned === true,
      })),
    });
    await new Promise(resolve => setTimeout(resolve, 800));
    await loadMerchantsAndProducts();
  } else {
    log('ERR: No se pudieron guardar los filtros de productos.', 'err');
  }

  _isToggling = false;
  const currentSelect = document.getElementById('merchantSelect');
  if (currentSelect) currentSelect.disabled = false;
  if (!result.ok) renderPendingProductChanges();
}

/** Agrega un nuevo merchant ID a la configuracion. */
async function addMerchant() {
  const input = prompt('Ingresa el ID del nuevo merchant:');
  if (!input) return;
  const id = parseInt(input.trim());
  if (isNaN(id) || id <= 0) {
    log('ID invalido', 'warn');
    return;
  }

  // Leer el input actual de merchantIds
  const raw = document.getElementById('cfgMerchantIds').value.trim();
  const ids = raw ? raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [];
  if (!ids.includes(id)) ids.push(id);

  // Actualizar input y guardar
  document.getElementById('cfgMerchantIds').value = ids.join(',');
  await updateConfig();
}

/** Elimina un merchant de la configuracion. */
async function removeMerchant(merchantId) {
  if (!confirm(`Eliminar merchant ${merchantId}?`)) return;

  const raw = document.getElementById('cfgMerchantIds').value.trim();
  const ids = raw ? raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [];
  const filtered = ids.filter(id => id !== merchantId);
  document.getElementById('cfgMerchantIds').value = filtered.join(',');
  await updateConfig();
}

/** Fuerza la recarga de productos desde la API del backend. */
async function reloadProducts() {
  if (_isToggling) return;
  if (_pendingProductIds.size > 0) {
    log('Guarda los filtros pendientes antes de recargar productos.', 'warn');
    return;
  }
  _isToggling = true;

  // Buscar todos los botones de recargar y mostrar loading
  const btns = document.querySelectorAll('button');
  const reloadBtns = [];
  btns.forEach(b => { if (b.textContent.includes('Recargar')) reloadBtns.push(b); });
  reloadBtns.forEach(b => b.classList.add('spinning'));

  log('Forzando recarga de productos...', 'info');
  const result = await callEndpoint('POST', '/products/reload');

  reloadBtns.forEach(b => b.classList.remove('spinning'));

  if (result.ok) {
    log(result.data.message, 'ok');
    setTimeout(() => loadMerchantsAndProducts(), 1500);
  } else {
    log('ERR: No se pudo recargar', 'err');
  }
  _isToggling = false;
}

/** Escapa HTML para prevenir XSS. */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  updatePollingStatusUI({
    phase: 'idle',
    isPolling: false,
    label: 'Polling detenido',
    counter: { totalSales: 0, totalAmount: 0 },
  });
  log('Panel de control listo. Elige un robot y pulsa Conectar.', 'info');
});
