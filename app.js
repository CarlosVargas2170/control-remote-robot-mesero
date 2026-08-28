/**
 * Control Remoto - Mini App QR
 * Panel de control para enviar comandos al robot.
 */

const LS_KEY_URL = 'rc_baseUrl';

// ── Mapeo endpoint → archivo local de audio ──

const AUDIO_MAP = {
  '/greet':             'audio/question_coffe.wav',
  '/play-question':     'audio/question_coffe.wav',
  '/play-thanks':       'audio/thanks_shopping.wav',
  '/play-buy':          'audio/purchase_buy.wav',
  '/play-order':        'audio/there_is_an_order.wav',
  '/play-attention':    'audio/attention_excuse_me.wav',
  '/play-collect-tray': 'audio/collect_tray.wav',
  '/play-coffee':       'audio/here_is_coffee.wav',
  '/play-order-2':      'audio/there_is_an_order_2.mp3',
};

// Etiquetas legibles para el badge visual
const AUDIO_LABELS = {
  'question_coffe.wav':      '¿Hola, quieres un café?',
  'thanks_shopping.wav':     'Gracias por tu compra',
  'purchase_buy.wav':        'Invitación a comprar',
  'there_is_an_order.wav':   '¡Orden recibida!',
  'attention_excuse_me.wav': 'Atención, disculpe',
  'collect_tray.wav':        'Cobrar bandeja',
  'here_is_coffee.wav':      '¡Aquí está tu café!',
  // Kíky audios
  'Aqui_tienes_Que_lo_d.wav':    'Aquí tienes. ¡Que lo disfrutes!',
  'Hola_deseas_un_Brown.wav':    'Hola, ¿deseas un Brownie de Kiky?',
  'Hola_deseas_un_Cremo.wav':    'Hola, ¿deseas un Cremoso 3 Leches de Kiky?',
  'Muchas_graacias.wav':         'Muchas gracias',
  'hello.wav':                   'Hola. ¿que tal?',
  'hello_and_question_name.wav': 'Hola Me llamo Robot Mesero ¿Tú cómo te llamas?',
  'attention_with_service.wav': '¡Con permiso por favor! Robot Mesero en servicio',

  'please_return_prod.wav':       'Por favor, devuelve el producto a la bandeja',
  'switch_product.wav':           'Con un solo dedo puedes deslizar hacia la derecha o izquierda para cambiar de producto',
  'select_button_to_pay.wav':     'Puedes presionar el botón "Pagar pedido con QR" para continuar con el pago',
  'there_is_an_order_2.mp3':      'Tengo un pedido ¿Lo puedes revisar? son los que dicen Robot Mesero 2',
  'dance_to_sell.wav':               'Si me compras un café, te hago un baile',
};

// ── Helpers ──

function getBaseUrl() {
  const input = document.getElementById('baseUrl');
  let url = input.value.trim();
  if (!url) url = 'http://localhost:8080';
  localStorage.setItem(LS_KEY_URL, url);
  return url.replace(/\/$/, '');
}

function loadSavedUrl() {
  const saved = localStorage.getItem(LS_KEY_URL);
  if (saved) document.getElementById('baseUrl').value = saved;
}

/** Muestra u oculta el botón exclusivo de Mesero 2 según el servidor seleccionado. */
function updateMesero2Visibility() {
  const select = document.getElementById('baseUrl');
  const btn = document.getElementById('btn-order-mesero2');
  const btnMesero1 = document.getElementById('btn-order-mesero1');
  if (btn && select) {
    const isMesero2 = select.value.includes('100.105.14.4');
    btn.style.display = isMesero2 ? '' : 'none';
    btnMesero1.style.display = isMesero2 ? 'none' : '';
  }
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

/** Actualiza el indicador visual de disponibilidad del servicio TTS (:9000). */
function setTtsStatus(online) {
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
    text.textContent = 'TTS Offline';
    if (btn) btn.disabled = true;
  }
}

/** Verifica la salud del servicio TTS en http://{host}:9000/health. */
async function checkTtsService() {
  setTtsStatus(false); // por defecto, offline hasta confirmar
  try {
    const baseUrl = getBaseUrl();
    const host = new URL(baseUrl).hostname;
    const res = await fetch(`http://${host}:9000/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const health = await res.json();
    if (health.status !== 'ok') {
      throw new Error(`Estado inesperado: ${health.status ?? 'desconocido'}`);
    }

    setTtsStatus(true);
    const gpuStatus = health.gpu ? 'GPU activa' : 'sin GPU';
    const speakers = health.speakers_loaded ?? 0;
    log(`Servicio TTS disponible en ${host}:9000 (${gpuStatus}, speakers: ${speakers})`, 'ok');
  } catch (err) {
    setTtsStatus(false);
    log(`Servicio TTS no disponible: ${err.message}`, 'warn');
  }
}

// ── Audio local ──

let _currentLocalAudio = null;

/** Reproduce un archivo de audio local (dentro de remote-control/audio/). */
function playLocal(filePath) {
  stopLocal();
  const audio = new Audio(filePath);

  // Mostrar badge visual
  showAudioBadge(filePath);

  // Ocultar badge cuando el audio termine naturalmente
  audio.addEventListener('ended', hideAudioBadge);
  audio.addEventListener('error', hideAudioBadge);

  audio.play().catch(e => {
    log(`Audio local: ${e.message}`, 'warn');
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

/** Muestra el badge de "audio en reproduccion" con el nombre del archivo. */
function showAudioBadge(filePath) {
  const badge = document.getElementById('audioLiveBadge');
  const text = document.getElementById('audioLiveText');
  if (!badge || !text) return;

  // Extraer nombre legible: "audio/question_coffe.wav" → "¿Quieres un café?"
  const fileName = filePath.includes('/') ? filePath.split('/').pop() : filePath;
  const label = AUDIO_LABELS[fileName] || fileName.replace('.wav', '').replace(/_/g, ' ');
  text.textContent = label;
  badge.style.display = 'flex';
}

/** Oculta el badge de audio. */
function hideAudioBadge() {
  const badge = document.getElementById('audioLiveBadge');
  if (badge) badge.style.display = 'none';
}

// ── Core ──

/**
 * Llama a un endpoint del robot.
 * @param {string} method - GET, POST, PUT, etc.
 * @param {string} path - Ruta del endpoint (ej: '/greet').
 * @param {Object|null} body - Body de la peticion (solo POST/PUT).
 * @param {string|null} localAudioFile - Ruta local del audio a reproducir si la respuesta es OK.
 */
async function setEmotion(emotion) {
  const result = await callEndpoint('POST', '/attract/set', { gif: emotion });
}


async function callEndpoint(method, path, body = null, localAudioFile = null) {
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
    playLocal(localAudioFile);
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
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    setConnectionStatus(false);
    log(`NET ERR: ${err.message}`, 'err');
    stopLocal(); // Rollback: sin conexión, cortar audio local
    return { ok: false, error: err.message };
  }
}

async function testConnection() {
  log('Probando conexion...', 'info');
  const result = await callEndpoint('GET', '/config');
  if (result.ok) {
    const cfg = result.data?.data || {};
    const merchants = cfg.merchantIds || [];
    log(`Conectado! Merchants=${merchants.join(',')}, Product=${cfg.productId}`, 'ok');
    // Cargar productos automaticamente tras conectar
    loadMerchantsAndProducts();
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

// ── Bind automático de botones de audio ──

/** Vincula automaticamente los elementos con data-audio="..." a callEndpoint. */
function bindAudioButtons() {
  document.querySelectorAll('[data-audio]').forEach(btn => {
    const path = btn.dataset.audio;
    const localFile = AUDIO_MAP[path] || null;
    btn.addEventListener('click', () => {
      callEndpoint('POST', path, null, localFile);
    });
  });
}

// ── Audio custom ──

/** Reproduce un audio con un solo click: local + robot en paralelo.
 *  @param {string} assetPath - Ruta del asset en el robot (ej: 'audio/kiky/...')
 *  @param {string} localPath - Ruta del archivo local (ej: 'audio/kiky/...')
 */
async function quickPlay(assetPath, localPath) {
  // Reproducir localmente
  playLocal(localPath);

  // Extraer nombre del archivo para el displayText en el robot.
  const fileName = localPath.includes('/') ? localPath.split('/').pop() : localPath;
  const displayText = AUDIO_LABELS[fileName] || null;

  // Enviar al robot
  const result = await callEndpoint('POST', '/audio/play', {
    asset: assetPath,
    volume: 1.0,
    force: false,
    displayText: displayText,
  });

  if (!result.ok) {
    log('⚠️ Robot no reprodujo. Sonando solo local.', 'warn');
  }
}

/** Muestra el carrusel desde el primer producto y reproduce un audio.
 *  El asset debe existir en assets/audio/ dentro de mini-app-qr.
 *  @param {string} assetPath - Ruta del asset en el robot.
 *  @param {string} localPath - Copia local usada para oír el audio en el panel.
 *  @param {Object} options - Opciones force, displayText y showOverlay.
 */
async function greetWithAudio(assetPath, localPath, options = {}) {
  const asset = String(assetPath || '').trim();
  if (!asset) {
    log('Selecciona una ruta de audio para mostrar el carrusel', 'warn');
    return { ok: false, error: 'asset_required' };
  }

  const fileName = asset.includes('/') ? asset.split('/').pop() : asset;
  const displayText = options.displayText ?? AUDIO_LABELS[fileName] ?? null;
  const params = new URLSearchParams({ asset });

  if (options.force === true) params.set('force', 'true');
  if (displayText) params.set('displayText', displayText);
  if (options.showOverlay === false) params.set('showOverlay', 'false');

  if (localPath) playLocal(localPath);

  const result = await callEndpoint('POST', `/greet/audio?${params.toString()}`);
  if (!result.ok) {
    log('⚠️ No se pudo mostrar el carrusel con el audio seleccionado.', 'warn');
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

  if (!_ttsOnline) {
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

  const baseUrl = getBaseUrl();
  const host = new URL(baseUrl).hostname;
  const TTS_URL = `http://${host}:9000/synthesize/play`;
  const TTS_TOKEN = '501a8d0c5fe72d11e5af9e246548e3ec501458f61b770558813552aae7ce89e1';

  try {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/octet-stream',
        'Authorization': `Bearer ${TTS_TOKEN}`,
      },
      body: JSON.stringify({
        text: text,
        speaker_id: 'default',
        language: 'es',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log(`ERR TTS ${res.status}: ${errText}`, 'err');
      return;
    }

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
  const selectedStillExists = merchants.some(m => String(m.merchantId) === _selectedMerchantId);
  if (!selectedStillExists) {
    const initiallyEnabled = merchants.find(m => m.enabled === true);
    _selectedMerchantId = initiallyEnabled
      ? String(initiallyEnabled.merchantId)
      : (merchants.length > 0 ? String(merchants[0].merchantId) : null);
  }

  const selectedMerchant = merchants.find(m => String(m.merchantId) === _selectedMerchantId);
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

  container.innerHTML = `
    <div class="merchant-picker">
      <span class="merchant-picker-icon" aria-hidden="true">🏪</span>
      <div class="merchant-picker-body">
        <label class="merchant-select-label" for="merchantSelect">Comercio habilitado</label>
        <div class="merchant-select-wrap">
          <select id="merchantSelect" class="merchant-select" onchange="toggleMerchant(this.value, this)" ${_isToggling ? 'disabled' : ''}>
            ${options}
          </select>
        </div>
      </div>
    </div>
    <div class="merchant-selection-status">
      ${selected ? `<span class="merchant-status-dot"></span><strong>${selected.visibleCount ?? 0}</strong> de ${selected.productCount ?? selected.products?.length ?? 0} productos visibles` : ''}
    </div>`;
}

/** Renderiza la lista de productos agrupados por merchant. */
function renderProductList(merchants) {
  const container = document.getElementById('productList');
  if (!container) return;

  const selectedMerchant = merchants?.find(m => String(m.merchantId) === _selectedMerchantId);
  if (!selectedMerchant) {
    container.innerHTML = '<p class="hint-text">Sin productos</p>';
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
  if (selectedId === KIKY_MERCHANT_ID) {
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

/** Muestra/oculta el panel de selección de alertas según el toggle. */
function toggleAlertasSelect() {
  const toggle = document.getElementById('alertasToggle');
  const panel = document.getElementById('alertasPanel');
  if (toggle && panel) {
    panel.style.display = toggle.checked ? 'flex' : 'none';
  }
}

/** Reproduce la alerta seleccionada en el dropdown. */
async function playAlertAudio() {
  const select = document.getElementById('alertasDropdown');
  const volume = parseFloat(document.getElementById('alertasVolume').value) || 1.0;
  const asset = select?.value?.trim();

  if (!asset) {
    log('Selecciona una alerta del dropdown', 'warn');
    return;
  }

  const fileName = asset.includes('/') ? asset.split('/').pop() : asset;
  const localFile = `audio/${fileName}`;

  // Reproducir local
  playLocal(localFile);

  // Enviar al robot
  const result = await callEndpoint('POST', '/audio/play', {
    asset,
    volume,
    force: true,
    displayText: null,
    showOverlay: false,
  });

  if (!result.ok) {
    log('⚠️ Robot no reprodujo. Sonando solo local.', 'warn');
  }
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
  loadSavedUrl();
  bindAudioButtons();
  updateMesero2Visibility();
  document.getElementById('baseUrl').addEventListener('change', updateMesero2Visibility);
  updatePollingStatusUI({
    phase: 'idle',
    isPolling: false,
    label: 'Polling detenido',
    counter: { totalSales: 0, totalAmount: 0 },
  });
  log('Panel de control listo. Configura la IP y pulsa Conectar.', 'info');
});
