/**
 * Pantalla para elegir, por mesero, qué emociones, secciones y botones (con su audio) aparecen
 * en el control remoto. Lo desmarcado se oculta solo en ese mesero; lo nuevo aparece en todos.
 *
 * Cada sección es una tarjeta plegable con su contador, "Todos / Ninguno" y un buscador
 * global que filtra botones y abre las secciones con coincidencias.
 */
const RobotPanelPage = (() => {
  /** Crea un elemento con propiedades e hijos. Nunca usa innerHTML. */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  const $ = id => document.getElementById(id);
  const emptyChanges = () => ({ sections: {}, buttons: {}, emotions: {} });

  /** Configuración guardada en el backend para el robot elegido. */
  let saved = null;
  /** Cambios sin guardar: {sections: {code: bool}, buttons: {id: bool}, emotions: {code: bool}}. */
  let pending = emptyChanges();
  /** Tarjetas abiertas ('emotions' o el code de la sección). Se conserva al redibujar. */
  const expanded = new Set(['emotions']);
  let query = '';

  function errorText(err) {
    if (window.AdminGate && AdminGate.rejected(err)) return 'El token de acceso ya no es válido.';
    if (err && err.isUnauthorized) return 'Token del panel inválido: revísalo en el panel (Backend ⚙️).';
    return err && err.message ? err.message : String(err);
  }

  function setStatus(text, type = '') {
    const node = $('rpStatus');
    node.textContent = text;
    node.classList.toggle('ok', type === 'ok');
    node.classList.toggle('error-text', type === 'err');
  }

  function normalize(text) {
    return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // ── Estado de los cambios ──

  function hasPending() {
    return Object.values(pending).some(group => Object.keys(group).length > 0);
  }

  function pendingCount() {
    return Object.values(pending).reduce((total, group) => total + Object.keys(group).length, 0);
  }

  /** Valor mostrado: el cambio pendiente si existe, si no el guardado. */
  function current(group, key, savedValue) {
    return key in pending[group] ? pending[group][key] : savedValue;
  }

  /** Registra un cambio; si vuelve al valor guardado, deja de ser un cambio. */
  function setChange(group, key, value, savedValue) {
    if (value === savedValue) delete pending[group][key];
    else pending[group][key] = value;
  }

  const sectionOn = section => current('sections', section.code, section.enabled);
  const buttonOn = button => current('buttons', button.id, button.enabled);
  const emotionOn = emotion => current('emotions', emotion.code, emotion.enabled);

  // ── Resumen y botones de guardado ──

  function refreshChrome() {
    const changes = pendingCount();
    $('rpSave').disabled = changes === 0;
    $('rpReset').disabled = changes === 0;
    $('rpSave').textContent = changes ? `Guardar (${changes})` : 'Guardar';

    if (!saved) return;
    let buttonsTotal = 0;
    let buttonsShown = 0;
    let sectionsShown = 0;
    for (const section of saved.sections) {
      const on = sectionOn(section);
      if (on) sectionsShown += 1;
      for (const button of section.buttons) {
        buttonsTotal += 1;
        if (on && buttonOn(button)) buttonsShown += 1;
      }
    }
    const emotionsShown = saved.emotions.filter(emotionOn).length;
    const summary = $('rpSummary');
    summary.replaceChildren(
      el('strong', {}, `${sectionsShown}/${saved.sections.length}`), ' secciones · ',
      el('strong', {}, `${buttonsShown}/${buttonsTotal}`), ' botones · ',
      el('strong', {}, `${emotionsShown}/${saved.emotions.length}`), ' emociones visibles');
  }

  // ── Piezas de la lista ──

  function checkbox(checked, onChange) {
    const input = el('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  function link(text, onClick, title) {
    const button = el('button', { type: 'button', className: 'rp-link', title: title || '' }, text);
    button.addEventListener('click', onClick);
    return button;
  }

  function sectionTag(section) {
    if (section.visibility === 'merchant') return `comercio ${section.merchant_id}`;
    if (section.visibility === 'fallback') return 'sin sección propia';
    return null;
  }

  /** Tarjeta plegable: cabecera (casilla, título, contador, acciones) + contenido. */
  function card({ key, checked, onToggleAll, title, tag, count, partial, bulk, items, off, forceOpen }) {
    const open = forceOpen || expanded.has(key);
    const root = el('section', { className: `rp-card${open ? ' open' : ''}${off ? ' off' : ''}` });

    const head = el('div', { className: 'rp-card-head' });
    if (onToggleAll) head.append(checkbox(checked, onToggleAll));

    const toggle = el('button', { type: 'button', className: 'rp-toggle', title: 'Mostrar u ocultar la lista' },
      el('span', { className: 'rp-title' }, title),
      ...(tag ? [el('span', { className: 'rp-tag' }, tag)] : []),
      el('span', { className: `rp-count${partial ? ' partial' : ''}` }, count),
      el('span', { className: 'rp-chevron' }, '›'));
    toggle.addEventListener('click', () => {
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      root.classList.toggle('open', expanded.has(key) || forceOpen);
    });
    head.append(toggle);
    if (bulk) head.append(el('span', { className: 'rp-bulk' }, ...bulk));

    root.append(head, items);
    return root;
  }

  function itemRow({ label, checked, disabled, onChange }) {
    const row = el('label', { className: `rp-item${checked ? '' : ' off'}${disabled ? ' disabled' : ''}` });
    const input = checkbox(checked, value => {
      onChange(value);
      row.classList.toggle('off', !value);
      refreshChrome();
      refreshCounters();
    });
    input.disabled = disabled;
    row.append(input, el('span', {}, label));
    return row;
  }

  // ── Dibujo ──

  /** Contadores de las tarjetas: se vuelven a pintar sin redibujar toda la lista. */
  function refreshCounters() {
    const body = $('rpBody');
    const scroll = body.scrollTop;
    renderEmotions();
    renderSections();
    body.scrollTop = scroll;
  }

  function renderEmotions() {
    const host = $('rpEmotionsCard');
    const emotions = saved.emotions.filter(e => !query || normalize(`${e.label} ${e.code}`).includes(query));
    host.replaceChildren();
    if (query && !emotions.length) return;

    const shown = saved.emotions.filter(emotionOn).length;
    const setAll = value => {
      saved.emotions.forEach(e => setChange('emotions', e.code, value, e.enabled));
      refreshChrome();
      renderEmotions();
    };
    const items = el('div', { className: 'rp-items' },
      ...(saved.emotions.length ? [] : [el('p', { className: 'rp-empty' }, 'No hay emociones.')]),
      ...emotions.map(emotion => itemRow({
        label: `${emotion.icon || ''} ${emotion.label}`.trim(),
        checked: emotionOn(emotion),
        onChange: value => setChange('emotions', emotion.code, value, emotion.enabled),
      })));

    host.append(card({
      key: 'emotions',
      title: '😊 Emociones (GIF)',
      count: `${shown}/${saved.emotions.length}`,
      partial: shown !== saved.emotions.length,
      bulk: [link('Todos', () => setAll(true)), link('Ninguno', () => setAll(false))],
      items,
      forceOpen: Boolean(query),
    }));
  }

  function renderSections() {
    const host = $('rpSections');
    host.replaceChildren();
    let visibleCards = 0;

    for (const section of saved.sections) {
      const titleMatches = !query || normalize(`${section.title} ${section.code}`).includes(query);
      const buttons = section.buttons.filter(b =>
        titleMatches || normalize(`${b.label} ${b.audio_code ?? ''}`).includes(query));
      if (!buttons.length && !titleMatches) continue;
      visibleCards += 1;

      const on = sectionOn(section);
      const shown = section.buttons.filter(buttonOn).length;
      const setAll = value => {
        section.buttons.forEach(b => setChange('buttons', b.id, value, b.enabled));
        refreshChrome();
        refreshCounters();
      };

      const items = el('div', { className: 'rp-items' },
        ...(buttons.length ? [] : [el('p', { className: 'rp-empty' }, 'Esta sección no tiene botones para este mesero.')]),
        ...buttons.map(button => itemRow({
          label: `${button.icon || ''} ${button.label}`.trim(),
          checked: buttonOn(button),
          disabled: !on,
          onChange: value => setChange('buttons', button.id, value, button.enabled),
        })));

      host.append(card({
        key: section.code,
        checked: on,
        onToggleAll: value => {
          setChange('sections', section.code, value, section.enabled);
          refreshChrome();
          refreshCounters();
        },
        title: `${section.icon || ''} ${section.title}`.trim(),
        tag: sectionTag(section),
        count: on ? `${shown}/${section.buttons.length}` : 'oculta',
        partial: on && shown !== section.buttons.length,
        bulk: on ? [link('Todos', () => setAll(true)), link('Ninguno', () => setAll(false))] : null,
        items,
        off: !on,
        forceOpen: Boolean(query) && !titleMatches,
      }));
    }

    if (!visibleCards) {
      host.append(el('p', { className: 'rp-empty' }, query ? 'Nada coincide con la búsqueda.' : 'No hay secciones.'));
    }
  }

  function render() {
    renderEmotions();
    renderSections();
    refreshChrome();
  }

  // ── Carga, guardado y copia ──

  async function loadRobot(code) {
    setStatus('Cargando...');
    try {
      saved = await RoboticsApi.panel.getRobotConfig(code);
      pending = emptyChanges();
      render();
      setStatus('');
    } catch (err) {
      setStatus(errorText(err), 'err');
    }
  }

  async function save() {
    const code = $('rpRobot').value;
    $('rpSave').disabled = true;
    setStatus('Guardando...');
    try {
      saved = await RoboticsApi.panel.saveRobotConfig(code, pending);
      pending = emptyChanges();
      render();
      setStatus('Guardado. El control remoto lo aplica al recargar este mesero.', 'ok');
    } catch (err) {
      refreshChrome();
      setStatus(errorText(err), 'err');
    }
  }

  /** Trae a la pantalla lo que otro mesero muestra; no guarda hasta pulsar Guardar. */
  async function copyFrom() {
    const source = $('rpCopyFrom').value;
    if (!source || source === $('rpRobot').value) return;
    setStatus('Leyendo configuración...');
    try {
      const other = await RoboticsApi.panel.getRobotConfig(source);
      const sections = new Map(other.sections.map(s => [s.code, s.enabled]));
      const buttons = new Map(other.sections.flatMap(s => s.buttons.map(b => [b.id, b.enabled])));
      const emotions = new Map(other.emotions.map(e => [e.code, e.enabled]));

      pending = emptyChanges();
      for (const s of saved.sections) {
        if (sections.has(s.code)) setChange('sections', s.code, sections.get(s.code), s.enabled);
        for (const b of s.buttons) {
          if (buttons.has(b.id)) setChange('buttons', b.id, buttons.get(b.id), b.enabled);
        }
      }
      for (const e of saved.emotions) {
        if (emotions.has(e.code)) setChange('emotions', e.code, emotions.get(e.code), e.enabled);
      }
      render();
      setStatus('Copiado a la pantalla. Revisa y pulsa Guardar.', 'ok');
    } catch (err) {
      setStatus(errorText(err), 'err');
    }
  }

  function fillSelect(select, robots, blank) {
    select.replaceChildren(
      ...(blank ? [el('option', { value: '' }, blank)] : []),
      ...robots.map(r => el('option', { value: r.code }, r.name)));
  }

  async function init() {
    $('rpSave').addEventListener('click', save);
    $('rpReset').addEventListener('click', () => { pending = emptyChanges(); render(); setStatus(''); });
    $('rpCopy').addEventListener('click', copyFrom);
    $('rpSearch').addEventListener('input', event => {
      query = normalize(event.target.value.trim());
      if (saved) render();
    });
    $('rpRobot').addEventListener('change', event => {
      const select = event.target;
      if (hasPending() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) {
        select.value = select.dataset.last;
        return;
      }
      select.dataset.last = select.value;
      loadRobot(select.value);
    });
    window.addEventListener('beforeunload', event => {
      if (hasPending()) event.preventDefault();
    });

    let robots;
    try {
      robots = (await RoboticsApi.robots.list()).data;
      $('rpDot').className = 'dot online';
      $('rpStatusText').textContent = 'Backend';
    } catch (err) {
      $('rpDot').className = 'dot offline';
      $('rpStatusText').textContent = err.isUnauthorized ? 'Token inválido' : 'Sin backend';
      $('rpEmotionsCard').replaceChildren();
      setStatus(errorText(err), 'err');
      return;
    }

    fillSelect($('rpRobot'), robots);
    fillSelect($('rpCopyFrom'), robots, 'Elegir mesero...');
    if (robots.length) {
      $('rpRobot').dataset.last = $('rpRobot').value;
      loadRobot($('rpRobot').value);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();
