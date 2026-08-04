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
  'select_button_to_pay.wav':     'Puedes presionar el botón "Pagar con QR" para continuar con el pago',
  'there_is_an_order_2.mp3':      'Tengo un pedido ¿Lo puedes revisar? son los que dicen Robot Mesero 2',
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
  console.log(path)
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
  console.log("nombre del archivo: "+fileName)
  const displayText = AUDIO_LABELS[fileName] || null;
  console.log("texto del audio: "+displayText)

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

/**
 * Carga la lista de productos desde GET /products y renderiza la UI.
 */
async function loadMerchantsAndProducts() {
  const result = await callEndpoint('GET', '/products');

  if (!result.ok) {
    document.getElementById('merchantList').innerHTML = '<p class="hint-text">Error al cargar productos</p>';
    document.getElementById('productList').innerHTML = '<p class="hint-text">Error al cargar</p>';
    return;
  }

  const data = result.data;
  if (!data.cacheLoaded || !data.data) {
    document.getElementById('merchantList').innerHTML = '<p class="hint-text">No hay productos cargados. Pulsa Conectar cuando la app este iniciada.</p>';
    document.getElementById('productList').innerHTML = '<p class="hint-text">Carga productos primero</p>';
    updateHeaderCount(0, 0);
    return;
  }

  _productState = data.data;
  _currentFilterMode = _productState.filterMode || 'all';
  updateFilterModeButtons();
  renderMerchantList(_productState.merchants);
  renderProductList(_productState.merchants);
  updateHeaderCount(_productState.totalProducts, _productState.visibleProducts);
}

/** Renderiza la lista de merchants con toggles. */
function renderMerchantList(merchants) {
  const container = document.getElementById('merchantList');
  if (!container) return;

  if (!merchants || merchants.length === 0) {
    container.innerHTML = '<p class="hint-text">No hay merchants configurados</p>';
    return;
  }

  let html = '';
  for (const m of merchants) {
    const enabled = m.enabled !== false;
    const cls = enabled ? '' : 'disabled';
    html += `
      <div class="merchant-item ${cls}" id="merchant-${m.merchantId}">
        <span class="merchant-icon">${enabled ? '✅' : '⛔'}</span>
        <div class="merchant-info">
          <div class="merchant-name">[${m.merchantId}] ${escHtml(m.merchantName)}</div>
          <div class="merchant-stats">${m.visibleCount}/${m.productCount} visibles</div>
        </div>
        <div class="merchant-actions">
          <label class="toggle-switch" title="${enabled ? 'Deshabilitar' : 'Habilitar'} merchant">
            <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleMerchant(${m.merchantId}, this)">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-remove" title="Eliminar merchant" onclick="removeMerchant(${m.merchantId})">×</button>
        </div>
      </div>`;
  }
  html += `
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="btn-sm" style="flex:1" onclick="addMerchant()">+ Agregar</button>
      <button class="btn-sm accent" style="flex:1" onclick="reloadProducts()">Recargar</button>
    </div>`;
  container.innerHTML = html;
}

/** Renderiza la lista de productos agrupados por merchant. */
function renderProductList(merchants) {
  const container = document.getElementById('productList');
  if (!container) return;

  if (!merchants || merchants.length === 0) {
    container.innerHTML = '<p class="hint-text">Sin productos</p>';
    return;
  }

  const colors = [
    '#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f0883e', '#39d2c0',
    '#f85149', '#8b949e'
  ];
  let colorIdx = 0;
  let html = '';

  for (const m of merchants) {
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
      <button class="btn-sm success" style="flex:1" onclick="saveFilters()">Guardar filtros</button>
    </div>`;
  container.innerHTML = html;
}

/** Actualiza el contador en el header de Productos. */
function updateHeaderCount(total, visible) {
  const badge = document.getElementById('filterModeBadge');
  if (badge) badge.textContent = `${_currentFilterMode.toUpperCase()} · ${visible}/${total}`;
}

/** Habilita/deshabilita un merchant con loading state y auto-refresh. */
async function toggleMerchant(merchantId, checkbox) {
  if (_isToggling) { checkbox.checked = !checkbox.checked; return; }
  _isToggling = true;
  const enabled = checkbox.checked;

  log(`Merchant ${merchantId}: ${enabled ? 'habilitando' : 'deshabilitando'}...`, 'info');
  const result = await callEndpoint('POST', '/products/filter', {
    merchants: { [String(merchantId)]: { enabled } },
    reload: true
  });

  if (result.ok) {
    log(`OK: Merchant ${merchantId} ${enabled ? 'habilitado' : 'deshabilitado'}`, 'ok');
    setTimeout(() => loadMerchantsAndProducts(), 800);
  } else {
    checkbox.checked = !enabled; // Revertir toggle
    log(`ERR: No se pudo ${enabled ? 'habilitar' : 'deshabilitar'} merchant ${merchantId}`, 'err');
  }
  _isToggling = false;
}

/** Muestra/oculta un producto con loading state y auto-refresh. */
async function toggleProduct(productId, checkbox) {
  if (_isToggling) { checkbox.checked = !checkbox.checked; return; }
  _isToggling = true;
  const visible = checkbox.checked;

  const result = await callEndpoint('POST', '/products/filter', {
    products: { [String(productId)]: { visible } },
    reload: true
  });

  if (result.ok) {
    log(`Producto ${productId}: ${visible ? 'visible' : 'oculto'}`, 'ok');
    setTimeout(() => loadMerchantsAndProducts(), 800);
  } else {
    checkbox.checked = !visible;
    log(`ERR: No se pudo ${visible ? 'mostrar' : 'ocultar'} producto ${productId}`, 'err');
  }
  _isToggling = false;
}

/** Fija/desfija un producto con loading state y auto-refresh. */
async function togglePinProduct(productId, pinned, btn) {
  if (_isToggling) return;
  _isToggling = true;

  if (btn) btn.style.opacity = '0.5';

  const result = await callEndpoint('POST', '/products/filter', {
    products: { [String(productId)]: { pinned } },
    reload: true
  });

  if (btn) btn.style.opacity = '';

  if (result.ok) {
    log(`Producto ${productId}: ${pinned ? 'fijado' : 'desfijado'}`, 'ok');
    setTimeout(() => loadMerchantsAndProducts(), 800);
  } else {
    log(`ERR: No se pudo ${pinned ? 'fijar' : 'desfijar'} producto ${productId}`, 'err');
  }
  _isToggling = false;
}

/** Cambia el modo de filtro con loading state y auto-refresh. */
async function setFilterMode(mode) {
  if (_isToggling) return;
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

/** Guarda los filtros actuales en disco (persistencia). */
async function saveFilters() {
  if (!_productState) {
    log('No hay productos cargados', 'warn');
    return;
  }
  // La config ya se persiste al hacer POST /products/filter con reload:true
  // Este boton es para feedback visual
  log('Filtros guardados en la app.', 'ok');
  loadMerchantsAndProducts();
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
