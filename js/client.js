window.NfcHubClient = (() => {
  const BUTTONS = {
    google_review: { label: 'Avaliar no Google', icon: 'star', type: 'url' },
    instagram: { label: 'Instagram', icon: 'camera', type: 'url' },
    facebook: { label: 'Facebook', icon: 'thumbs-up', type: 'url' },
    website: { label: 'Nosso site', icon: 'globe-2', type: 'url' },
    menu: { label: 'Cardápio', icon: 'utensils', type: 'url' },
    whatsapp: { label: 'WhatsApp', icon: 'message-circle', type: 'whatsapp' },
    phone: { label: 'Telefone', icon: 'phone', type: 'phone' },
    location: { label: 'Localização', icon: 'map-pin', type: 'url' },
    wifi: { label: 'Conectar Wi-Fi', icon: 'wifi', type: 'wifi' },
    add_to_home: { label: 'Adicionar à tela inicial', icon: 'plus-square', type: 'shortcut' },
    custom: { label: 'Atalho personalizado', icon: 'link', type: 'custom' },
  };
  const CUSTOM_ICONS = ['link', 'globe-2', 'message-circle', 'mail', 'phone', 'map-pin', 'instagram', 'facebook', 'star', 'calendar-days', 'shopping-bag', 'info', 'external-link'];
  let api; let user; let logout; let tenant; let buttons = []; let wifi = null; let managedTenantId = null; let returnToAdmin = null;
  const app = () => document.querySelector('#app');
  const icons = () => window.lucide?.createIcons();
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const customIcon = (button) => CUSTOM_ICONS.includes(button.config?.icon) ? button.config.icon : 'link';
  const buttonIcon = (button) => button.kind === 'custom' ? customIcon(button) : (BUTTONS[button.kind]?.icon || 'link');

  function toast(message, error = false) {
    const element = document.createElement('div'); element.className = `toast${error ? ' error' : ''}`; element.textContent = message; document.body.append(element); setTimeout(() => element.remove(), 3800);
  }
  function publicUrl() { return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}p/index.html?slug=${encodeURIComponent(tenant.public_slug)}`; }
  function logoUrl(path) { return path ? api.storage.from('tenant-logos').getPublicUrl(path).data.publicUrl : ''; }
  function initials(name) { return (name || 'N').trim().charAt(0).toUpperCase(); }

  async function loadTenant() {
    let loadedTenant;
    if (managedTenantId) {
      const { data, error } = await api.from('tenants').select('*').eq('id', managedTenantId).maybeSingle();
      if (error || !data) return null;
      loadedTenant = data;
    } else {
      const { data, error } = await api.from('tenant_memberships').select('tenant_id, role, tenants!inner(*)').eq('user_id', user.id).limit(1).maybeSingle();
      if (error || !data?.tenants) return null;
      loadedTenant = data.tenants;
    }
    tenant = loadedTenant;
    const results = await Promise.all([
      api.from('tenant_buttons').select('*').eq('tenant_id', tenant.id).order('display_order'),
      api.from('wifi_settings').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    ]);
    buttons = results[0].data || [];
    wifi = results[1].data || null;
    return tenant;
  }

  function unavailable() {
    const actionLabel = returnToAdmin ? 'Voltar à administração' : 'Sair';
    app().innerHTML = `<section class="login-page"><div class="access-denied"><div class="metric-icon">${icon('building-x')}</div><h1>Painel indisponível</h1><p>Seu estabelecimento está temporariamente indisponível ou sua conta ainda não possui acesso.</p><button class="button button-secondary" id="client-signout">${actionLabel}</button></div></section>`;
    document.querySelector('#client-signout').addEventListener('click', returnToAdmin || logout); icons();
  }

  function shell() {
    const masterControls = returnToAdmin ? `<div class="master-controls"><span id="managed-tenant-label"></span><button class="button button-secondary" id="return-to-admin">${icon('arrow-left')}Voltar à administração</button></div>` : '';
    const signOutLabel = returnToAdmin ? 'Voltar à administração' : 'Sair';
    app().innerHTML = `<div class="admin-layout client-layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="brand-mark">N</span>NFC Hub</div><nav class="nav"><button class="active" data-client-view="menu">${icon('list')}Meu Menu</button><button data-client-view="customize">${icon('palette')}Personalização</button><button data-client-view="analytics">${icon('chart-no-axes-combined')}Estatísticas</button><a class="nav-public-link" id="public-link" target="_blank" rel="noopener noreferrer">${icon('external-link')}Página pública</a></nav><div class="sidebar-footer"><strong id="tenant-name-side"></strong><span>${user.email || ''}</span><button id="client-signout">${signOutLabel}</button></div></aside><main class="main"><header class="topbar"><button class="menu-toggle" id="menu-toggle" aria-label="Abrir menu">${icon('menu')}</button><div class="brand"><span class="brand-mark">N</span>Meu estabelecimento</div>${masterControls}</header><section class="view" id="client-view"></section></main></div>`;
    document.querySelector('#tenant-name-side').textContent = tenant.name;
    document.querySelector('#public-link').href = publicUrl();
    document.querySelector('#client-signout').addEventListener('click', returnToAdmin || logout);
    if (returnToAdmin) {
      document.querySelector('#managed-tenant-label').textContent = `Configurando: ${tenant.name}`;
      document.querySelector('#return-to-admin').addEventListener('click', returnToAdmin);
    }
    document.querySelector('#menu-toggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
    document.querySelectorAll('[data-client-view]').forEach((button) => button.addEventListener('click', () => show(button.dataset.clientView)));
    icons();
  }

  function activeNav(view) {
    document.querySelectorAll('[data-client-view]').forEach((element) => element.classList.toggle('active', element.dataset.clientView === view));
    document.querySelector('#sidebar').classList.remove('open');
  }

  function preview(parent, draft = tenant) {
    const section = document.createElement('section'); section.className = 'live-preview';
    const phone = document.createElement('div'); phone.className = 'phone-preview'; phone.style.background = draft.background_color; phone.style.color = draft.text_color;
    const identity = document.createElement('div'); identity.className = 'preview-identity';
    if (draft.logo_path) { const image = document.createElement('img'); image.src = logoUrl(draft.logo_path); image.alt = ''; identity.append(image); }
    else { const fallback = document.createElement('div'); fallback.className = 'logo-fallback'; fallback.style.background = draft.primary_color; fallback.textContent = initials(draft.name); identity.append(fallback); }
    const name = document.createElement('strong'); name.textContent = draft.name; identity.append(name); phone.append(identity);
    buttons.filter((button) => button.active).slice(0, 5).forEach((button) => { const item = document.createElement('div'); item.className = `preview-button ${draft.button_style}`; item.style.borderColor = draft.primary_color; item.style.background = draft.button_style === 'outline' ? 'transparent' : draft.primary_color; item.style.color = draft.button_style === 'outline' ? draft.primary_color : '#fff'; item.textContent = button.label; phone.append(item); });
    if (!buttons.some((button) => button.active)) { const empty = document.createElement('p'); empty.className = 'preview-empty'; empty.textContent = 'Ative opções do menu para vê-las aqui.'; phone.append(empty); }
    section.append(phone); parent.append(section);
  }

  function row(button, index) {
    const item = document.createElement('article'); item.className = 'menu-row';
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = button.active; toggle.setAttribute('aria-label', `Ativar ${button.label}`);
    toggle.addEventListener('change', () => saveButton(button, { active: toggle.checked }, toggle));
    const glyph = document.createElement('span'); glyph.className = 'menu-icon'; glyph.innerHTML = icon(buttonIcon(button));
    const content = document.createElement('div'); content.className = 'menu-row-content';
    const title = document.createElement('strong'); title.textContent = button.label;
    const detail = document.createElement('span'); detail.textContent = BUTTONS[button.kind]?.label || button.kind;
    content.append(title, detail);
    const controls = document.createElement('div'); controls.className = 'menu-row-controls';
    const edit = document.createElement('button'); edit.className = 'button button-secondary button-icon'; edit.title = 'Editar'; edit.innerHTML = icon('pencil'); edit.addEventListener('click', () => editButton(button));
    const up = document.createElement('button'); up.className = 'button button-secondary button-icon'; up.title = 'Subir'; up.disabled = index === 0; up.innerHTML = icon('arrow-up'); up.addEventListener('click', () => move(button, -1));
    const down = document.createElement('button'); down.className = 'button button-secondary button-icon'; down.title = 'Descer'; down.disabled = index === buttons.length - 1; down.innerHTML = icon('arrow-down'); down.addEventListener('click', () => move(button, 1));
    controls.append(edit, up, down); item.append(toggle, glyph, content, controls); return item;
  }

  function showMenu() {
    const view = document.querySelector('#client-view'); view.replaceChildren();
    const header = document.createElement('header'); header.className = 'view-header'; header.innerHTML = `<div><p class="eyebrow">PÁGINA PÚBLICA</p><h1>Meu Menu</h1><p>Somente opções ativadas e configuradas aparecem para seus visitantes.</p></div>`;
    const layout = document.createElement('div'); layout.className = 'client-grid';
    const panel = document.createElement('section'); panel.className = 'panel'; const title = document.createElement('div'); title.className = 'panel-title'; title.innerHTML = '<h2>Opções do menu</h2>'; const add = document.createElement('button'); add.className = 'button button-secondary'; add.type = 'button'; add.innerHTML = `${icon('plus')}Novo botão`; add.addEventListener('click', () => editButton(null)); title.append(add); panel.append(title);
    const list = document.createElement('div'); list.className = 'menu-list'; buttons.forEach((button, index) => list.append(row(button, index))); panel.append(list); layout.append(panel); preview(layout); view.append(header, layout); icons();
  }

  async function saveButton(button, patch, source) {
    const payload = { ...patch };
    if (payload.active && button.kind !== 'wifi' && button.kind !== 'add_to_home' && !button.target_url) { toast('Configure um destino seguro antes de ativar esta opção.', true); source.checked = false; return; }
    if (payload.active && button.kind === 'wifi' && !wifi) { toast('Configure a rede Wi-Fi antes de ativar esta opção.', true); source.checked = false; return; }
    const { error } = await api.from('tenant_buttons').update(payload).eq('id', button.id).eq('tenant_id', tenant.id);
    if (error) { toast('Não foi possível salvar esta opção. Revise a configuração.', true); source.checked = !source.checked; return; }
    Object.assign(button, payload); showMenu();
  }

  async function move(button, direction) {
    const from = buttons.indexOf(button); const other = buttons[from + direction]; if (!other) return;
    const a = button.display_order; const b = other.display_order;
    const [first, second] = await Promise.all([
      api.from('tenant_buttons').update({ display_order: b }).eq('id', button.id).eq('tenant_id', tenant.id),
      api.from('tenant_buttons').update({ display_order: a }).eq('id', other.id).eq('tenant_id', tenant.id),
    ]);
    if (first.error || second.error) return toast('Não foi possível alterar a ordem.', true);
    button.display_order = b; other.display_order = a; buttons.sort((left, right) => left.display_order - right.display_order); showMenu();
  }

  function modal(title, subtitle) {
    const back = document.createElement('div'); back.className = 'modal-backdrop'; const box = document.createElement('section'); box.className = 'modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const head = document.createElement('header'); head.className = 'modal-header'; const copy = document.createElement('div'); const heading = document.createElement('h2'); heading.textContent = title; const text = document.createElement('p'); text.textContent = subtitle; copy.append(heading, text); const close = document.createElement('button'); close.className = 'close'; close.innerHTML = icon('x'); close.setAttribute('aria-label', 'Fechar'); head.append(copy, close); box.append(head); back.append(box); const dismiss = () => back.remove(); close.addEventListener('click', dismiss); back.addEventListener('click', (event) => { if (event.target === back) dismiss(); }); document.body.append(back); icons(); return { box, dismiss };
  }

  function normalizeUrl(value, kind, message = '') {
    const raw = value.trim(); if (!raw) return '';
    if (kind === 'phone') { const number = raw.replace(/\D/g, ''); return number ? `tel:+${number}` : ''; }
    if (kind === 'whatsapp') { const number = raw.replace(/\D/g, ''); const text = message.trim(); return number ? `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}` : ''; }
    if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? `mailto:${raw.toLowerCase()}` : '';
    try { const url = new URL(raw.match(/^https?:\/\//i) ? raw : `https://${raw}`); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; }
  }

  function editCustomButton(button) {
    const creating = !button; const data = modal(creating ? 'Novo botao' : `Editar ${button.label}`, 'Defina o nome, destino e icone. Na pagina publica aparece somente o nome e o icone.'); const form = document.createElement('form');
    form.innerHTML = `<label class="field">Nome exibido<input name="label" maxlength="60" required /></label><label class="field">Este botao abre<select name="destination_type"><option value="url">Um site ou link</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="location">Localizacao no mapa</option></select></label><label class="field" id="custom-destination"><span></span><input name="destination" required /></label><label class="field custom-message hidden">Mensagem opcional<textarea name="message" maxlength="300"></textarea></label><fieldset class="icon-picker"><legend>Icone</legend><div>${CUSTOM_ICONS.map((name) => `<button type="button" class="icon-choice" data-custom-icon="${name}" title="${name}">${icon(name)}</button>`).join('')}</div></fieldset><label class="field"><span><input name="active" type="checkbox" checked /> Exibir este botao no menu</span></label><p class="notice hidden"></p><div class="form-actions"><button type="button" class="button button-secondary" data-cancel>Cancelar</button><button class="button" type="submit">Salvar</button></div>`;
    const type = form.elements.destination_type; const destination = form.elements.destination; const message = form.elements.message; let selectedIcon = customIcon(button || {});
    const configureDestination = () => { const current = type.value; const label = current === 'whatsapp' ? 'WhatsApp com DDI' : current === 'email' ? 'E-mail' : current === 'phone' ? 'Telefone com DDI' : current === 'location' ? 'Link do Google Maps' : 'URL de destino'; form.querySelector('#custom-destination span').textContent = label; destination.placeholder = current === 'whatsapp' ? '5541999999999' : current === 'email' ? 'contato@exemplo.com' : current === 'phone' ? '5541999999999' : current === 'location' ? 'https://maps.google.com/...' : 'https://exemplo.com'; form.querySelector('.custom-message').classList.toggle('hidden', current !== 'whatsapp'); };
    const selectIcon = () => form.querySelectorAll('[data-custom-icon]').forEach((choice) => choice.classList.toggle('selected', choice.dataset.customIcon === selectedIcon));
    form.elements.label.value = button?.label || ''; form.elements.active.checked = button?.active ?? true; type.value = button?.config?.destination_type || 'url';
    const currentType = type.value; const currentTarget = button?.target_url || ''; destination.value = currentType === 'whatsapp' ? currentTarget.replace(/^https:\/\/wa\.me\//, '').split('?')[0] : currentType === 'email' ? currentTarget.replace(/^mailto:/, '') : currentType === 'phone' ? currentTarget.replace(/^tel:\+?/, '') : currentTarget; message.value = button?.config?.message || ''; configureDestination(); selectIcon();
    type.addEventListener('change', configureDestination); form.querySelectorAll('[data-custom-icon]').forEach((choice) => choice.addEventListener('click', () => { selectedIcon = choice.dataset.customIcon; selectIcon(); })); form.querySelector('[data-cancel]').addEventListener('click', data.dismiss); data.box.append(form); icons();
    form.addEventListener('submit', async (event) => { event.preventDefault(); const destinationValue = normalizeUrl(destination.value, type.value === 'location' ? 'url' : type.value, message.value); const notice = form.querySelector('.notice'); if (!destinationValue) { notice.textContent = 'Informe um destino valido e seguro.'; notice.classList.remove('hidden'); return; } const payload = { label: form.elements.label.value.trim(), target_url: destinationValue, active: form.elements.active.checked, config: { destination_type: type.value, icon: selectedIcon, ...(type.value === 'whatsapp' && message.value.trim() ? { message: message.value.trim() } : {}) } }; let error; if (creating) { const result = await api.from('tenant_buttons').insert({ ...payload, tenant_id: tenant.id, kind: 'custom', display_order: Math.max(0, ...buttons.map((item) => item.display_order || 0)) + 10 }); error = result.error; } else { const result = await api.from('tenant_buttons').update(payload).eq('id', button.id).eq('tenant_id', tenant.id); error = result.error; } if (error) { notice.textContent = error.message || 'Nao foi possivel salvar o botao.'; notice.classList.remove('hidden'); return; } data.dismiss(); await loadTenant(); showMenu(); });
  }

  function editButton(button) {
    if (!button || button.kind === 'custom') return editCustomButton(button);
    if (button.kind === 'wifi') return editWifi(button);
    if (button.kind === 'add_to_home') { toast('Esta ação usa o recurso de instalação do navegador e não precisa de destino.'); return; }
    const definition = BUTTONS[button.kind] || { type: 'url' }; const data = modal(`Editar ${definition.label || button.label}`, 'Use destinos seguros. Esquemas javascript: e data: não são aceitos.'); const form = document.createElement('form'); form.innerHTML = `<label class="field">Nome exibido<input name="label" maxlength="60" required /></label><label class="field">${definition.type === 'phone' ? 'Telefone com DDI' : definition.type === 'whatsapp' ? 'WhatsApp com DDI' : 'URL de destino'}<input name="destination" required />${definition.type === 'whatsapp' ? '<small>Use o DDI sem +. Exemplo: 5541997331796.</small>' : ''}</label>${definition.type === 'whatsapp' ? '<label class="field">Mensagem opcional<textarea name="message" maxlength="300"></textarea></label>' : ''}<p class="notice hidden"></p><div class="form-actions"><button type="button" class="button button-secondary" data-cancel>Cancelar</button><button class="button" type="submit">Salvar</button></div>`;
    form.elements.label.value = button.label;
    form.elements.destination.value = definition.type === 'phone' ? (button.target_url || '').replace(/^tel:\+?/, '') : definition.type === 'whatsapp' ? (button.target_url || '').replace(/^https:\/\/wa\.me\//, '').split('?')[0] : button.target_url || '';
    if (definition.type === 'whatsapp') form.elements.message.value = button.config?.message || '';
    data.box.append(form); form.querySelector('[data-cancel]').addEventListener('click', data.dismiss);
    form.addEventListener('submit', async (event) => { event.preventDefault(); const message = definition.type === 'whatsapp' ? form.elements.message.value : ''; const destination = normalizeUrl(form.elements.destination.value, definition.type, message); const notice = form.querySelector('.notice'); if (!destination) { notice.textContent = 'Informe um destino válido e seguro.'; notice.classList.remove('hidden'); return; } const config = definition.type === 'whatsapp' ? { message: message.trim() } : {}; const { error } = await api.from('tenant_buttons').update({ label: form.elements.label.value.trim(), target_url: destination, config }).eq('id', button.id).eq('tenant_id', tenant.id); if (error) { notice.textContent = error.message || 'Não foi possível salvar o destino.'; notice.classList.remove('hidden'); return; } Object.assign(button, { label: form.elements.label.value.trim(), target_url: destination, config }); data.dismiss(); showMenu(); });
  }

  function editWifi(button) {
    const data = modal('Configurar Wi-Fi', 'Use somente uma rede de convidados. A senha será revelada ao visitante apenas quando esta opção estiver ativa.'); const form = document.createElement('form'); form.innerHTML = `<label class="field">Nome da rede (SSID)<input name="ssid" maxlength="32" required /></label><label class="field">Segurança<select name="security_type"><option>WPA2</option><option>WPA3</option><option>WPA</option><option>WEP</option><option value="nopass">Sem senha</option></select></label><label class="field">Senha<input name="password" maxlength="63" /></label><label class="field"><span><input name="hidden" type="checkbox" /> Rede oculta</span></label><p class="notice hidden"></p><div class="form-actions"><button type="button" class="button button-secondary" data-cancel>Cancelar</button><button class="button" type="submit">Salvar Wi-Fi</button></div>`;
    if (wifi) { form.elements.ssid.value = wifi.ssid; form.elements.password.value = wifi.password; form.elements.security_type.value = wifi.security_type; form.elements.hidden.checked = wifi.hidden; }
    data.box.append(form); form.querySelector('[data-cancel]').addEventListener('click', data.dismiss);
    form.elements.security_type.addEventListener('change', () => { if (form.elements.security_type.value === 'nopass') form.elements.password.value = ''; });
    form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form).entries()); values.tenant_id = tenant.id; values.hidden = form.elements.hidden.checked; if (values.security_type === 'nopass') values.password = ''; const { data: saved, error } = await api.from('wifi_settings').upsert(values).select().single(); const notice = form.querySelector('.notice'); if (error) { notice.textContent = 'Revise os dados de segurança e senha da rede.'; notice.classList.remove('hidden'); return; } wifi = saved; data.dismiss(); toast('Wi-Fi configurado. Ative o botão quando desejar publicar.'); });
  }

  function showCustomize() {
    const view = document.querySelector('#client-view'); view.replaceChildren(); const header = document.createElement('header'); header.className = 'view-header'; header.innerHTML = '<div><p class="eyebrow">IDENTIDADE</p><h1>Personalização</h1><p>Atualize como seu estabelecimento aparece na página pública.</p></div>'; const layout = document.createElement('div'); layout.className = 'client-grid'; const panel = document.createElement('section'); panel.className = 'panel client-form-panel';
    const form = document.createElement('form'); form.innerHTML = `<div class="form-grid"><label class="field full">Nome do estabelecimento<input name="name" maxlength="120" required /></label><label class="field">Cor primária<input name="primary_color" type="color" /></label><label class="field">Cor secundária<input name="secondary_color" type="color" /></label><label class="field">Cor de fundo<input name="background_color" type="color" /></label><label class="field">Cor do texto<input name="text_color" type="color" /></label><label class="field full">Estilo dos botões<select name="button_style"><option value="solid">Sólido</option><option value="outline">Contorno</option><option value="soft">Suave</option></select></label></div><div class="logo-tools"><strong>Logo</strong><span id="logo-status"></span><input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" /><button class="button button-secondary" id="remove-logo" type="button">Remover logo</button></div><div class="form-actions"><button class="button" type="submit">Salvar personalização</button></div>`;
    ['name', 'primary_color', 'secondary_color', 'background_color', 'text_color', 'button_style'].forEach((key) => { form.elements[key].value = tenant[key]; form.elements[key].addEventListener('input', () => updateDraft()); });
    panel.append(form); layout.append(panel); const previewTarget = document.createElement('div'); previewTarget.className = 'preview-wrap'; layout.append(previewTarget); view.append(header, layout); const updateDraft = () => { const draft = { ...tenant }; ['name', 'primary_color', 'secondary_color', 'background_color', 'text_color', 'button_style'].forEach((key) => draft[key] = form.elements[key].value); previewTarget.replaceChildren(); preview(previewTarget, draft); }; updateDraft();
    form.querySelector('#logo-status').textContent = tenant.logo_path ? 'Logo atual configurado' : 'Usando identidade pelo nome'; form.querySelector('#logo-file').addEventListener('change', (event) => uploadLogo(event.target.files[0], form)); form.querySelector('#remove-logo').addEventListener('click', () => removeLogo(form)); form.addEventListener('submit', async (event) => { event.preventDefault(); const patch = Object.fromEntries(new FormData(form).entries()); const { error } = await api.from('tenants').update(patch).eq('id', tenant.id); if (error) return toast('Não foi possível salvar a personalização.', true); Object.assign(tenant, patch); document.querySelector('#tenant-name-side').textContent = tenant.name; toast('Personalização salva.'); updateDraft(); });
  }

  async function imageKind(file) { const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()); const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value); const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255; const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP'; return png ? 'png' : jpg ? 'jpg' : webp ? 'webp' : ''; }
  function makeAppIcon(file) { return new Promise((resolve) => { const source = URL.createObjectURL(file); const image = new Image(); const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512; const context = canvas.getContext('2d'); const finish = () => canvas.toBlob((blob) => { URL.revokeObjectURL(source); resolve(blob); }, 'image/png'); const fallback = () => { context.fillStyle = tenant.primary_color || '#176b4d'; context.fillRect(0, 0, 512, 512); context.fillStyle = '#ffffff'; context.font = '700 290px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(initials(tenant.name), 256, 275); finish(); }; image.onload = () => { context.fillStyle = tenant.primary_color || '#176b4d'; context.fillRect(0, 0, 512, 512); context.fillStyle = '#ffffff'; context.beginPath(); context.arc(256, 256, 230, 0, Math.PI * 2); context.fill(); const scale = Math.min(420 / image.naturalWidth, 420 / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale; context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height); finish(); }; image.onerror = fallback; image.src = source; }); }
  async function uploadLogo(file, form) { if (!file) return; if (file.size > 2 * 1024 * 1024) return toast('A logo deve ter no máximo 2 MB.', true); const extension = await imageKind(file); if (!extension) return toast('Envie uma imagem PNG, JPG ou WebP válida.', true); const path = `${tenant.id}/${crypto.randomUUID()}.${extension}`; const iconPath = `${tenant.id}/app-icon-${crypto.randomUUID()}.png`; const { error: uploadError } = await api.storage.from('tenant-logos').upload(path, file, { contentType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`, upsert: false }); if (uploadError) return toast('Não foi possível enviar a logo.', true); const iconFile = await makeAppIcon(file); const { error: iconError } = iconFile ? await api.storage.from('tenant-logos').upload(iconPath, iconFile, { contentType: 'image/png', upsert: false }) : { error: new Error('Icon unavailable') }; if (iconError) { await api.storage.from('tenant-logos').remove([path]); return toast('Não foi possível gerar o ícone do aplicativo.', true); } const oldPaths = [tenant.logo_path, tenant.app_icon_path].filter(Boolean); const { error: updateError } = await api.from('tenants').update({ logo_path: path, app_icon_path: iconPath }).eq('id', tenant.id); if (updateError) { await api.storage.from('tenant-logos').remove([path, iconPath]); return toast('Não foi possível associar a logo ao estabelecimento.', true); } Object.assign(tenant, { logo_path: path, app_icon_path: iconPath }); if (oldPaths.length) await api.storage.from('tenant-logos').remove(oldPaths); form.querySelector('#logo-status').textContent = 'Logo e ícone do app configurados'; toast('Logo e ícone do aplicativo atualizados.'); showCustomize(); }
  async function removeLogo(form) { if (!tenant.logo_path) return; const oldPaths = [tenant.logo_path, tenant.app_icon_path].filter(Boolean); const { error } = await api.from('tenants').update({ logo_path: null, app_icon_path: null }).eq('id', tenant.id); if (error) return toast('Não foi possível remover a logo.', true); Object.assign(tenant, { logo_path: null, app_icon_path: null }); await api.storage.from('tenant-logos').remove(oldPaths); form.querySelector('#logo-status').textContent = 'Usando identidade pelo nome'; toast('Logo removida.'); showCustomize(); }

  async function showAnalytics() {
    const view = document.querySelector('#client-view');
    view.innerHTML = '<header class="view-header"><div><p class="eyebrow">DESEMPENHO</p><h1>Estatísticas</h1><p>Acessos e interações da sua página pública.</p></div></header><div id="analytics-content"><p class="empty">Carregando estatísticas...</p></div>';
    const { data, error } = await api.rpc('get_tenant_analytics', { requested_tenant_id: tenant.id });
    const content = document.querySelector('#analytics-content');
    if (error || !data) { content.innerHTML = '<p class="empty">Não foi possível carregar as estatísticas.</p>'; return; }
    window.NfcHubAnalytics.render(content, data);
  }

  function show(view) { activeNav(view); if (view === 'customize') showCustomize(); else if (view === 'analytics') showAnalytics(); else showMenu(); }
  async function start(context) {
    api = context.supabase;
    user = context.currentUser;
    logout = context.signOut;
    managedTenantId = context.tenantId || null;
    returnToAdmin = context.onExit || null;
    if (!await loadTenant()) return unavailable();
    shell();
    showMenu();
  }
  return { start };
})();
