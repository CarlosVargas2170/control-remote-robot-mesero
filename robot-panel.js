/**
 * Pantalla para elegir, por mesero, qué emociones, secciones y botones (con su audio) aparecen
 * en el control remoto. Lo desmarcado se oculta solo en ese mesero; lo nuevo aparece en todos.
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

  function errorText(err) {
    if (err && err.isUnauthorized) return 'Token del panel inválido: revísalo en el panel (Backend ⚙️).';
    return err && err.message ? err.message : String(err);
  }

  function setStatus(text, type = '') {
    const node = $('rpStatus');
    node.textContent = text;
    node.classList.toggle('ok', type === 'ok');
    node.classList.toggle('error-text', type === 'err');
  }

  function hasPending() {
    return Object.values(pending).some(group => Object.keys(group).length > 0);
  }

  function refreshButtons() {
    $('rpSave').disabled = !hasPending();
    $('rpReset').disabled = !hasPending();
  }

  /** Valor mostrado: el cambio pendiente si existe, si no el guardado. */
  function current(group, key, savedValue) {
    return key in pending[group] ? pending[group][key] : savedValue;
  }

  /** Registra un cambio; si vuelve al valor guardado, deja de ser un cambio. */
  function setChange(group, key, value, savedValue) {
    if (value === savedValue) delete pending[group][key];
    else pending[group][key] = value;
    refreshButtons();
  }

  function checkbox(checked, onChange) {
    const input = el('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  function renderEmotions() {
    const box = $('rpEmotions');
    box.replaceChildren();
    if (!saved.emotions.length) box.append(el('p', { className: 'hint-text' }, 'No hay emociones.'));
    for (const emotion of saved.emotions) {
      const label = el('label', { className: 'rp-item' });
      const input = checkbox(current('emotions', emotion.code, emotion.enabled), value => {
        setChange('emotions', emotion.code, value, emotion.enabled);
        label.classList.toggle('off', !value);
      });
      label.classList.toggle('off', !input.checked);
      label.append(input, el('span', {}, `${emotion.icon || ''} ${emotion.label}`.trim()));
      box.append(label);
    }
  }

  function sectionTag(section) {
    if (section.visibility === 'merchant') return `comercio ${section.merchant_id}`;
    if (section.visibility === 'fallback') return 'comercios sin sección propia';
    return null;
  }

  function renderSections() {
    const box = $('rpSections');
    box.replaceChildren();
    if (!saved.sections.length) box.append(el('p', { className: 'hint-text' }, 'No hay secciones.'));

    for (const section of saved.sections) {
      const group = el('div', { className: 'rp-group' });
      const buttons = el('div');

      const sectionBox = checkbox(current('sections', section.code, section.enabled), value => {
        setChange('sections', section.code, value, section.enabled);
        group.classList.toggle('off', !value);
        buttons.querySelectorAll('input').forEach(input => { input.disabled = !value; });
      });
      const tag = sectionTag(section);
      const header = el('label', { className: 'rp-section-row' },
        sectionBox,
        el('span', {}, `${section.icon || ''} ${section.title}`.trim()),
        ...(tag ? [el('span', { className: 'rp-tag' }, tag)] : []));
      group.classList.toggle('off', !sectionBox.checked);

      for (const button of section.buttons) {
        const item = el('label', { className: 'rp-item' });
        const input = checkbox(current('buttons', button.id, button.enabled), value => {
          setChange('buttons', button.id, value, button.enabled);
          item.classList.toggle('off', !value);
        });
        input.disabled = !sectionBox.checked;
        item.classList.toggle('off', !input.checked);
        item.append(input, el('span', {}, `${button.icon || ''} ${button.label}`.trim()));
        buttons.append(item);
      }
      group.append(header, buttons);
      box.append(group);
    }
  }

  function render() {
    renderEmotions();
    renderSections();
    refreshButtons();
  }

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
      setStatus('Guardado. El control remoto lo aplica al volver a cargar este mesero.', 'ok');
    } catch (err) {
      refreshButtons();
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
    $('rpRobot').addEventListener('change', event => {
      const select = event.target;
      if (hasPending() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) {
        select.value = select.dataset.last;
        return;
      }
      select.dataset.last = select.value;
      loadRobot(select.value);
    });

    let robots;
    try {
      robots = (await RoboticsApi.robots.list()).data;
      $('rpDot').className = 'dot online';
      $('rpStatusText').textContent = 'Backend';
    } catch (err) {
      $('rpDot').className = 'dot offline';
      $('rpStatusText').textContent = err.isUnauthorized ? 'Token inválido' : 'Sin backend';
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
