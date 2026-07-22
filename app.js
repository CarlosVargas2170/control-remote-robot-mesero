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
      log(`OK ${res.status} → ${JSON.stringify(data)}`, 'ok');

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
  log('Probando conexión...', 'info');
  const result = await callEndpoint('GET', '/config');
  if (result.ok) {
    const cfg = result.data?.data || {};
    log(`¡Conectado! Merchant=${cfg.merchantId}, Product=${cfg.productId}`, 'ok');
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

async function playCustomAudio() {
  const asset = document.getElementById('customAsset').value.trim();
  const volume = parseFloat(document.getElementById('customVolume').value) || 1.0;
  const force = document.getElementById('customForce').checked;

  if (!asset) {
    log('Escribe la ruta del asset de audio', 'warn');
    return;
  }

  // Extraer solo el nombre del archivo (ej: "audio/alerta.wav" → "alerta.wav")
  const fileName = asset.includes('/') ? asset.split('/').pop() : asset;
  const localFile = `audio/${fileName}`;

  // Reproducir local ANTES del endpoint (sincronía)
  playLocal(localFile);

  const result = await callEndpoint('POST', '/audio/play', { asset, volume, force });
  // No se pasa localFile a callEndpoint: playLocal ya se ejecutó arriba.
  // Si el endpoint falla, callEndpoint NO hará rollback (porque no recibió localAudioFile)
  // así que el audio local sigue sonando como fallback.
  if (!result.ok) {
    log('⚠️ No se pudo reproducir en el robot. Sonando solo localmente.', 'warn');
  }
}

// ── Config ──

async function updateConfig() {
  const body = {};
  const baseUrl = document.getElementById('cfgBaseUrl').value.trim();
  const token = document.getElementById('cfgToken').value.trim();
  const merchantId = document.getElementById('cfgMerchantId').value;
  const productId = document.getElementById('cfgProductId').value;

  if (baseUrl) body.baseUrl = baseUrl;
  if (token) body.bearerToken = token;
  if (merchantId) body.merchantId = parseInt(merchantId);
  if (productId) body.productId = parseInt(productId);

  if (Object.keys(body).length === 0) {
    log('Nada que actualizar. Rellena al menos un campo.', 'warn');
    return;
  }

  const result = await callEndpoint('POST', '/config', body);
  if (result.ok) {
    log('Configuración guardada. Reinicia la app para aplicar.', 'ok');
  }
}

// ── Init ──

window.addEventListener('DOMContentLoaded', () => {
  loadSavedUrl();
  bindAudioButtons();
  log('Panel de control listo. Configura la IP y pulsa Conectar.', 'info');
});
