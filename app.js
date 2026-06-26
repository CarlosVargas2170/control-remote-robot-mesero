/**
 * Control Remoto - Mini App QR
 * Panel de control para enviar comandos al robot desde cualquier navegador.
 */

const LS_KEY_URL = 'rc_baseUrl';

// --- Helpers ---

function getBaseUrl() {
  const input = document.getElementById('baseUrl');
  let url = input.value.trim();
  if (!url) url = 'http://localhost:8080';
  // Guardar en localStorage
  localStorage.setItem(LS_KEY_URL, url);
  // Quitar slash final
  return url.replace(/\/$/, '');
}

function loadSavedUrl() {
  const saved = localStorage.getItem(LS_KEY_URL);
  if (saved) document.getElementById('baseUrl').value = saved;
}

function log(message, type = 'info') {
  const body = document.getElementById('logBody');
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
    text.textContent = 'Conectado';
    text.style.color = 'var(--green)';
  } else {
    dot.className = 'dot offline';
    text.textContent = 'Sin conexion';
    text.style.color = 'var(--red)';
  }
}

// --- Core ---

async function callEndpoint(method, path, body = null) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  log(`${method} ${path} ...`, 'info');

  const options = {
    method,
    headers: {
      'Accept': 'application/json',
    },
  };

  // Solo agregar Content-Type si hay body (POST/PUT con datos)
  if (body && (method === 'POST' || method === 'PUT')) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }

    if (res.ok) {
      setConnectionStatus(true);
      log(`OK ${res.status} -> ${JSON.stringify(data)}`, 'ok');
    } else {
      setConnectionStatus(false);
      log(`ERR ${res.status} -> ${JSON.stringify(data)}`, 'err');
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    setConnectionStatus(false);
    log(`NET ERR: ${err.message}`, 'err');
    return { ok: false, error: err.message };
  }
}

async function testConnection() {
  log('Probando conexion...', 'info');
  const result = await callEndpoint('GET', '/config');
  if (result.ok) {
    const cfg = result.data?.data || {};
    log(`Conectado! Merchant=${cfg.merchantId}, Product=${cfg.productId}`, 'ok');
  }
}

// --- Audio custom ---

async function playCustomAudio() {
  const asset = document.getElementById('customAsset').value.trim();
  const volume = parseFloat(document.getElementById('customVolume').value) || 1.0;
  const force = document.getElementById('customForce').checked;

  if (!asset) {
    log('Debes escribir la ruta del asset de audio', 'warn');
    return;
  }

  await callEndpoint('POST', '/audio/play', { asset, volume, force });
}

// --- Config ---

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
    log('Configuracion guardada. Reinicia la app para aplicar cambios.', 'ok');
  }
}

// --- Init ---

window.addEventListener('DOMContentLoaded', () => {
  loadSavedUrl();

  // Toggle logs
  const logHeader = document.querySelector('.log-header');
  const logPanel = document.getElementById('logPanel');
  logHeader.addEventListener('click', () => {
    logPanel.classList.toggle('collapsed');
  });

  log('Panel de control cargado. Configura la IP y pulsa Probar.', 'info');
});
