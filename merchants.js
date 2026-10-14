/* Administration uses live backend reads: cached lists must not replace assignments. */
(() => {
  const $ = id => document.getElementById(id);
  const request = (...args) => RoboticsApi.http.request(...args);
  const path = code => `/api/robots/${encodeURIComponent(code)}`;
  let merchants = [], robots = [], saved = [], draft = [], currentRobot = '', editing = null;
  let busy = false, loaded = false;
  const dirty = () => JSON.stringify(saved) !== JSON.stringify(draft);
  const message = error => error.isUnauthorized
    ? 'Token del panel inválido. Configuralo en Backend desde el control principal.'
    : error.status === 404 ? 'Actualizá robotics-backend para habilitar la administración de asignaciones.' : error.message;
  function text(id, value, error = false) {
    $(id).textContent = value;
    $(id).classList.toggle('error-text', error);
  }
  function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function lock(value) {
    busy = value;
    document.querySelectorAll('main button, main input, main select').forEach(el => { el.disabled = value; });
    $('robotSelect').disabled = value || !robots.length;
    $('merchantForm').elements.merchant_id.disabled = value || editing !== null;
    $('saveAssignments').disabled = value || !loaded || !dirty();
    $('discardAssignments').disabled = value || !loaded || !dirty();
  }
  function resetForm() {
    editing = null;
    $('merchantForm').reset();
    $('formTitle').textContent = 'Registrar comercio';
    lock(busy);
  }
  function renderCatalog() {
    $('catalogList').replaceChildren();
    if (!merchants.length) $('catalogList').append(node('p', 'No hay comercios registrados.', 'hint-text'));
    merchants.forEach(merchant => {
      const row = node('div', undefined, 'merchant-row');
      const description = node('div', undefined, 'merchant-description');
      description.append(node('strong', merchant.name), node('small', `ID ${merchant.merchant_id}`));
      const edit = node('button', 'Editar', 'btn-sm'); edit.type = 'button';
      edit.onclick = () => {
        editing = merchant.merchant_id;
        const form = $('merchantForm');
        form.elements.merchant_id.value = merchant.merchant_id;
        form.elements.name.value = merchant.name;
        form.elements.logo_url.value = merchant.logo_url || '';
        $('formTitle').textContent = `Editar comercio #${merchant.merchant_id}`;
        lock(false); form.elements.name.focus();
      };
      const toggle = node('button', merchant.active ? 'Pausar globalmente' : 'Reactivar', 'btn-sm'); toggle.type = 'button';
      toggle.onclick = async () => {
        if (merchant.active && !confirm(`¿Pausar ${merchant.name} en todos los meseros? Se aplicará cuando recarguen.`)) return;
        lock(true);
        try {
          const updated = await request('PATCH', `/api/merchants/${merchant.merchant_id}`, { body: { active: !merchant.active } });
          merchants = merchants.map(m => m.id === updated.id ? updated : m);
          renderCatalog(); renderAssignments();
          text('pageStatus', 'Estado global guardado. Pendiente de recarga en los meseros.');
        } catch (error) { text('pageStatus', message(error), true); }
        finally { lock(false); }
      };
      row.append(description, node('span', merchant.active ? 'Activo' : 'Pausado', `merchant-state${merchant.active ? '' : ' paused'}`), edit, toggle);
      $('catalogList').append(row);
    });
  }
  function renderAssignments() {
    $('assignmentList').replaceChildren(); $('assignmentSummary').replaceChildren();
    $('summaryTitle').textContent = `Resumen · ${robots.find(r => r.code === currentRobot)?.name || 'Elegí un mesero'}`;
    if (!loaded) { $('assignmentList').append(node('p', 'Seleccioná un mesero con conexión al backend.', 'hint-text')); return; }
    if (!merchants.length) $('assignmentList').append(node('p', 'Registrá un comercio primero.', 'hint-text'));
    merchants.forEach(merchant => {
      const assignment = draft.find(a => a.merchant_id === merchant.merchant_id);
      const label = node('label', undefined, 'merchant-row');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!assignment?.enabled;
      checkbox.onchange = () => {
        if (assignment) assignment.enabled = checkbox.checked;
        else draft.push({ merchant_id: merchant.merchant_id, enabled: checkbox.checked, sort_order: Math.max(-1, ...draft.map(a => a.sort_order)) + 1 });
        renderAssignments(); lock(false);
      };
      const description = node('span', undefined, 'merchant-description');
      description.append(node('strong', merchant.name), node('small', `ID ${merchant.merchant_id}${merchant.active ? '' : ' · Pausado globalmente'}`));
      label.append(checkbox, description); $('assignmentList').append(label);
      const row = node('div', undefined, 'merchant-row');
      const state = !assignment?.enabled ? 'Deshabilitado' : merchant.active ? 'Habilitado' : 'Pausado globalmente';
      row.append(node('span', merchant.name, 'merchant-description'), node('span', state, `merchant-state${state === 'Habilitado' ? '' : ' paused'}`));
      $('assignmentSummary').append(row);
    });
  }
  async function loadAssignments(code) {
    loaded = false; saved = []; draft = []; currentRobot = code; renderAssignments(); lock(true);
    try {
      const result = await request('GET', `${path(code)}/merchant-assignments`);
      saved = result.merchants.map(({ merchant_id, enabled, sort_order }) => ({ merchant_id, enabled, sort_order }));
      draft = structuredClone(saved); loaded = true; renderAssignments();
      text('assignmentStatus', '');
    } catch (error) { text('assignmentStatus', message(error), true); }
    finally { lock(false); }
  }
  async function refresh() {
    if (dirty() && !confirm('¿Descartar las asignaciones sin guardar y actualizar?')) return;
    loaded = false; saved = []; draft = []; lock(true);
    const results = await Promise.allSettled([request('GET', '/api/merchants'), request('GET', '/api/robots')]);
    const failure = results.find(r => r.status === 'rejected');
    if (failure) { text('pageStatus', message(failure.reason), true); text('connection', 'Sin conexión'); lock(false); renderAssignments(); return; }
    merchants = results[0].value; robots = results[1].value;
    renderCatalog(); $('robotSelect').replaceChildren(...robots.map(r => { const option = node('option', r.name); option.value = r.code; return option; }));
    if (robots.some(r => r.code === currentRobot)) $('robotSelect').value = currentRobot;
    text('connection', 'Backend conectado'); text('pageStatus', '');
    if (robots.length) await loadAssignments($('robotSelect').value);
    else { currentRobot = ''; renderAssignments(); lock(false); text('assignmentStatus', 'No hay meseros activos registrados.'); }
  }
  $('merchantForm').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    const form = event.target, id = Number(form.elements.merchant_id.value), name = form.elements.name.value.trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !name) { text('formStatus', 'Completá un ID entero positivo y un nombre.', true); return; }
    if (editing === null && merchants.some(m => m.merchant_id === id)) { text('formStatus', 'Ese ID ya existe. Usá Editar.', true); return; }
    lock(true);
    try {
      const body = { name, logo_url: form.elements.logo_url.value.trim() || null };
      const updated = await request(editing === null ? 'PUT' : 'PATCH', `/api/merchants/${id}`, { body });
      merchants = [...merchants.filter(m => m.merchant_id !== id), updated].sort((a, b) => a.merchant_id - b.merchant_id);
      resetForm(); renderCatalog(); renderAssignments(); text('formStatus', 'Comercio guardado. Podés asignarlo desde la otra pestaña.');
    } catch (error) { text('formStatus', message(error), true); }
    finally { lock(false); }
  };
  $('robotSelect').onchange = event => {
    if (dirty() && !confirm('¿Descartar los cambios de este mesero?')) { event.target.value = currentRobot; return; }
    loadAssignments(event.target.value);
  };
  $('saveAssignments').onclick = async () => {
    if (busy || !loaded || !dirty()) return;
    lock(true);
    try {
      await request('PUT', `${path(currentRobot)}/merchants`, { body: { merchants: draft } });
      saved = structuredClone(draft); text('assignmentStatus', 'Guardado. Pendiente de recarga en el mesero.');
    } catch (error) { text('assignmentStatus', message(error), true); }
    finally { lock(false); }
  };
  $('discardAssignments').onclick = () => { draft = structuredClone(saved); renderAssignments(); lock(false); text('assignmentStatus', 'Cambios descartados.'); };
  $('newMerchant').onclick = resetForm; $('retry').onclick = refresh;
  ['catalog', 'assignment'].forEach(name => $(name + 'Tab').onclick = () => {
    ['catalog', 'assignment'].forEach(other => {
      $(other + 'Tab').classList.toggle('active', name === other);
      $(other + 'Tab').setAttribute('aria-selected', String(name === other));
      $(other + 'Panel').hidden = name !== other;
    });
  });
  window.addEventListener('beforeunload', event => { if (dirty()) event.preventDefault(); });
  refresh();
})();
