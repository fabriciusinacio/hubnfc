(() => {
  const app = document.querySelector('#app');
  const config = window.NFC_HUB_CONFIG || {};
  let supabase;
  let currentUser;
  let tenantCache = [];

  const icon = (name, label) => `<i data-lucide="${name}" aria-hidden="true"></i><span class="sr-only">${label}</span>`;
  const refreshIcons = () => window.lucide?.createIcons();
  const escapeSelector = (value) => CSS.escape(value);

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function configured() {
    return config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes('SEU_');
  }

  function renderSetupRequired() {
    app.innerHTML = `<section class="login-page"><div class="login-panel"><div class="brand"><span class="brand-mark">N</span>NFC Hub</div><h1>Configuração necessária</h1><p>Preencha a URL e a chave anon do Supabase em <code>js/config.js</code> antes de iniciar o painel.</p></div></section>`;
  }

  function renderLogin() {
    app.innerHTML = `<section class="login-page"><form class="login-panel" id="login-form"><div class="brand"><span class="brand-mark">N</span>NFC Hub</div><h1>Painel administrativo</h1><p>Acesso exclusivo para administradores da plataforma.</p><label class="field">E-mail<input name="email" type="email" autocomplete="email" required /></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required /></label><p class="notice hidden" id="login-error"></p><button class="button" type="submit">Entrar ${icon('arrow-right', '')}</button></form></section>`;
    document.querySelector('#login-form').addEventListener('submit', login);
    refreshIcons();
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const errorElement = form.querySelector('#login-error');
    button.disabled = true;
    errorElement.classList.add('hidden');
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    button.disabled = false;
    if (error) {
      errorElement.textContent = 'Não foi possível entrar. Confira suas credenciais.';
      errorElement.classList.remove('hidden');
      return;
    }
    await boot();
  }

  function renderDenied() {
    app.innerHTML = `<section class="login-page"><div class="access-denied"><div class="metric-icon">${icon('shield-alert', '')}</div><h1>Acesso não autorizado</h1><p>Esta conta não possui permissão de super administrador.</p><button class="button button-secondary" id="sign-out">Sair</button></div></section>`;
    document.querySelector('#sign-out').addEventListener('click', signOut);
    refreshIcons();
  }

  function renderShell() {
    app.innerHTML = `<div class="admin-layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="brand-mark">N</span>NFC Hub</div><nav class="nav" aria-label="Navegação principal"><button class="active" data-view="dashboard">${icon('layout-dashboard', '')}Dashboard</button><button data-view="clients">${icon('building-2', '')}Clientes</button><button data-action="create">${icon('user-plus', '')}Criar cliente</button><button data-view="plates">${icon('qr-code', '')}Gerenciar placas</button><button data-view="statistics">${icon('chart-no-axes-combined', '')}Estatísticas</button><button data-view="settings">${icon('settings', '')}Configurações</button></nav><div class="sidebar-footer"><strong id="admin-name"></strong><span id="admin-email"></span><button id="sign-out">Sair</button></div></aside><main class="main"><header class="topbar"><button class="menu-toggle" id="menu-toggle" aria-label="Abrir menu">${icon('menu', '')}</button><div class="brand"><span class="brand-mark">N</span>Administração</div></header><section class="view" id="view"></section></main></div>`;
    document.querySelector('#admin-name').textContent = currentUser.user_metadata?.display_name || 'Super administrador';
    document.querySelector('#admin-email').textContent = currentUser.email || '';
    document.querySelector('#sign-out').addEventListener('click', signOut);
    document.querySelector('#menu-toggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
    document.querySelector('[data-action="create"]').addEventListener('click', openCreateModal);
    refreshIcons();
  }

  function setActiveNav(view) {
    document.querySelectorAll('.nav [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    document.querySelector('#sidebar').classList.remove('open');
  }

  function metric(label, key, iconName) {
    return `<article class="metric"><div class="metric-icon">${icon(iconName, '')}</div><strong data-metric="${key}">--</strong><span>${label}</span></article>`;
  }

  async function showView(view) {
    setActiveNav(view);
    const target = document.querySelector('#view');
    if (view === 'dashboard') {
      target.innerHTML = `<header class="view-header"><div><p class="eyebrow">VISÃO GERAL</p><h1>Dashboard</h1><p>Acompanhe a operação da plataforma em tempo real.</p></div><button class="button" id="create-client">${icon('user-plus', '')}+ Criar usuário</button></header><section class="metrics">${metric('Clientes cadastrados', 'total_tenants', 'building-2')}${metric('Clientes ativos', 'active_tenants', 'circle-check')}${metric('Clientes inativos', 'inactive_tenants', 'circle-pause')}${metric('Total de acessos', 'total_visits', 'mouse-pointer-click')}${metric('Total de cliques', 'total_clicks', 'chart-no-axes-combined')}</section>`;
      document.querySelector('#create-client').addEventListener('click', openCreateModal);
      refreshIcons();
      await loadMetrics();
      return;
    }
    if (view === 'clients') {
      target.innerHTML = `<header class="view-header"><div><p class="eyebrow">CADASTROS</p><h1>Clientes</h1><p>Gerencie estabelecimentos e seus responsáveis.</p></div><button class="button" id="create-client">${icon('user-plus', '')}+ Criar usuário</button></header><section class="panel"><div class="panel-title"><h2>Estabelecimentos</h2></div><div class="table-wrap"><table><thead><tr><th>Estabelecimento</th><th>Status</th><th>Cidade</th><th>Cadastro</th><th>Responsável</th><th>Ações</th></tr></thead><tbody id="tenant-list"><tr><td colspan="6" class="empty">Carregando clientes...</td></tr></tbody></table></div></section>`;
      document.querySelector('#create-client').addEventListener('click', openCreateModal);
      refreshIcons();
      await loadTenants();
      return;
    }
    if (view === 'statistics') {
      target.innerHTML = `<header class="view-header"><div><p class="eyebrow">ANALYTICS</p><h1>Estatísticas</h1><p>Consulte o desempenho de cada estabelecimento.</p></div></header><section class="panel analytics-selector"><div class="panel-title"><h2>Selecionar cliente</h2></div><div class="selector-content"><label class="field">Estabelecimento<select id="analytics-tenant"><option value="">Carregando clientes...</option></select></label><button class="button button-secondary" id="share-analytics" type="button" disabled>${icon('link', '')}Copiar link de estatísticas</button></div></section><div id="admin-analytics-content"><p class="empty">Selecione um cliente para visualizar as estatísticas.</p></div>`;
      await loadAdminAnalytics();
      return;
    }
    if (view === 'plates') {
      await window.NfcHubPlates.start({ api: supabase, target, notify: showToast });
      return;
    }
    if (view === 'settings') {
      target.innerHTML = `<header class="view-header"><div><p class="eyebrow">OPERAÇÃO</p><h1>Links úteis</h1><p>Ferramentas externas para configurar os estabelecimentos.</p></div></header><section class="utility-list"><article class="utility-item"><div class="utility-icon">${icon('map-pinned', '')}</div><div><h2>Google Place ID</h2><p>Ferramenta oficial do Google Maps.</p></div><a class="button button-secondary" href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer">${icon('external-link', '')}Abrir ferramenta</a></article></section>`;
      refreshIcons();
      return;
    }
    target.innerHTML = `<header class="view-header"><div><p class="eyebrow">EM BREVE</p><h1>Estatísticas</h1><p>Esta área será disponibilizada em uma próxima etapa.</p></div></header>`;
  }

  async function loadMetrics() {
    const { data, error } = await supabase.rpc('admin_dashboard_metrics');
    if (error || !data) return showToast('Não foi possível carregar os indicadores.', true);
    Object.entries(data).forEach(([key, value]) => {
      const element = document.querySelector(`[data-metric="${escapeSelector(key)}"]`);
      if (element) element.textContent = new Intl.NumberFormat('pt-BR').format(value);
    });
  }

  async function loadAdminAnalytics() {
    const select = document.querySelector('#analytics-tenant');
    const content = document.querySelector('#admin-analytics-content');
    const share = document.querySelector('#share-analytics');
    const { data: tenants, error } = await supabase.rpc('admin_list_tenants');
    if (error) { select.innerHTML = '<option value="">Não foi possível carregar clientes</option>'; return; }
    select.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Selecione um cliente'; select.append(placeholder);
    (tenants || []).forEach((tenant) => { const option = document.createElement('option'); option.value = tenant.id; option.textContent = tenant.name; select.append(option); });
    if (!(tenants || []).length) { placeholder.textContent = 'Nenhum cliente cadastrado'; return; }
    select.addEventListener('change', async () => {
      share.disabled = !select.value;
      if (!select.value) { content.innerHTML = '<p class="empty">Selecione um cliente para visualizar as estatísticas.</p>'; return; }
      content.innerHTML = '<p class="empty">Carregando estatísticas...</p>';
      const { data: analytics, error: analyticsError } = await supabase.rpc('get_tenant_analytics', { requested_tenant_id: select.value });
      if (analyticsError || !analytics) { content.innerHTML = '<p class="empty">Não foi possível carregar as estatísticas.</p>'; return; }
      window.NfcHubAnalytics.render(content, analytics);
    });
    share.addEventListener('click', async () => {
      if (!select.value) return;
      share.disabled = true;
      const { data, error } = await supabase.rpc('issue_tenant_analytics_share', { requested_tenant_id: select.value });
      if (error || !data?.token) { showToast('Não foi possível gerar o link de estatísticas.', true); share.disabled = false; return; }
      const link = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}stats/index.html?token=${encodeURIComponent(data.token)}`;
      const copied = await copyToClipboard(link);
      showToast(copied ? 'Link de estatísticas copiado. Válido por 30 dias.' : 'Link gerado, mas não foi possível copiá-lo automaticamente.', !copied);
      share.disabled = false;
    });
  }

  async function copyToClipboard(value) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(value); return true; }
      const input = document.createElement('textarea'); input.value = value; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
      const copied = document.execCommand('copy'); input.remove(); return copied;
    } catch { return false; }
  }

  async function loadTenants() {
    const body = document.querySelector('#tenant-list');
    const { data, error } = await supabase.rpc('admin_list_tenants');
    if (error) {
      body.replaceChildren();
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty';
      cell.textContent = 'Não foi possível carregar os clientes.';
      row.append(cell); body.append(row);
      return;
    }
    tenantCache = data || [];
    body.replaceChildren();
    if (!tenantCache.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6; cell.className = 'empty'; cell.textContent = 'Nenhum cliente cadastrado.';
      row.append(cell); body.append(row); return;
    }
    tenantCache.forEach((tenant) => body.append(createTenantRow(tenant)));
    refreshIcons();
  }

  function createTenantRow(tenant) {
    const row = document.createElement('tr');
    const details = document.createElement('td');
    const name = document.createElement('div'); name.className = 'tenant-name'; name.textContent = tenant.name;
    const slug = document.createElement('small'); slug.textContent = `/${tenant.public_slug}`; name.append(slug); details.append(name);
    const status = document.createElement('td'); const badge = document.createElement('span'); badge.className = `badge ${tenant.status}`; badge.textContent = tenant.status === 'active' ? 'Ativo' : tenant.status === 'inactive' ? 'Inativo' : 'Suspenso'; status.append(badge);
    const city = document.createElement('td'); city.textContent = tenant.city || 'Não informado';
    const created = document.createElement('td'); created.textContent = new Intl.DateTimeFormat('pt-BR').format(new Date(tenant.created_at));
    const responsible = document.createElement('td'); responsible.textContent = tenant.responsible_name || tenant.responsible_email || 'Não informado';
    const actions = document.createElement('td'); actions.className = 'actions';
    actions.append(actionButton('settings-2', 'Configurar página do cliente', () => openClientWorkspace(tenant)));
    actions.append(actionButton('eye', 'Visualizar cliente', () => openEditModal(tenant)));
    actions.append(actionButton('pencil', 'Editar cliente', () => openEditModal(tenant)));
    actions.append(actionButton(tenant.status === 'active' ? 'pause' : 'play', tenant.status === 'active' ? 'Desativar cliente' : 'Ativar cliente', () => toggleTenant(tenant)));
    row.append(details, status, city, created, responsible, actions);
    return row;
  }

  function actionButton(iconName, label, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label); button.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`; button.addEventListener('click', handler); return button;
  }

  function openClientWorkspace(tenant) {
    window.NfcHubClient.start({
      supabase,
      currentUser,
      signOut,
      tenantId: tenant.id,
      onExit: () => {
        renderShell();
        showView('clients');
      },
    });
  }
  window.NfcHubOpenClientWorkspace = openClientWorkspace;

  function openModal(title, subtitle, content) {
    const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><div><h2></h2><p></p></div><button class="close" aria-label="Fechar">${icon('x', '')}</button></header></section>`;
    backdrop.querySelector('h2').textContent = title; backdrop.querySelector('p').textContent = subtitle;
    backdrop.querySelector('.modal').append(content);
    const close = () => backdrop.remove();
    backdrop.querySelector('.close').addEventListener('click', close);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    document.body.append(backdrop); refreshIcons(); return { backdrop, close };
  }

  function createClientForm() {
    const form = document.createElement('form');
    form.innerHTML = `<p class="form-section">Estabelecimento</p><div class="form-grid"><label class="field">Nome<input name="tenant_name" maxlength="120" required /></label><label class="field">Slug público<input name="slug" pattern="[a-z0-9][a-z0-9\-]{2,62}" maxlength="63" required /><small>Minúsculas, números e hífens.</small></label><label class="field">Cidade<input name="city" maxlength="100" required /></label><label class="field">Telefone<input name="phone" maxlength="30" /></label><label class="field full">Endereço<input name="address" maxlength="240" /></label><label class="field">Status<select name="status"><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="suspended">Suspenso</option></select></label></div><p class="form-section">Usuário responsável</p><div class="form-grid"><label class="field">Nome<input name="user_name" maxlength="120" required /></label><label class="field">E-mail<input name="email" type="email" required /></label><label class="field full">Senha inicial<input name="password" type="password" minlength="12" autocomplete="new-password" required /><small>Mínimo de 12 caracteres. Não será armazenada pela interface.</small></label></div><p class="notice hidden"></p><div class="form-actions"><button class="button button-secondary" type="button" data-close>Cancelar</button><button class="button" type="submit">Criar cliente</button></div>`;
    return form;
  }

  function openCreateModal() {
    const form = createClientForm();
    const modal = openModal('Criar usuário', 'Cadastre o estabelecimento e seu administrador responsável.', form);
    form.querySelector('[data-close]').addEventListener('click', modal.close);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]'); const notice = form.querySelector('.notice');
      submit.disabled = true; notice.classList.add('hidden');
      const values = Object.fromEntries(new FormData(form).entries());
      const { data, error } = await supabase.functions.invoke('admin-create-client', { body: values });
      submit.disabled = false;
      let message = data?.error;
      if (error && !message) { try { message = (await error.context.json())?.error; } catch { message = null; } }
      if (error || message) { notice.textContent = message || 'Não foi possível criar o cliente.'; notice.classList.remove('hidden'); return; }
      modal.close(); showToast('Cliente e usuário responsável criados.'); showView('clients');
    });
  }

  function openEditModal(tenant) {
    const form = document.createElement('form');
    form.innerHTML = `<div class="form-grid"><label class="field">Nome<input name="name" maxlength="120" required /></label><label class="field">Slug público<input name="public_slug" pattern="[a-z0-9][a-z0-9\-]{2,62}" maxlength="63" required /></label><label class="field">Cidade<input name="city" maxlength="100" /></label><label class="field">Telefone<input name="phone" maxlength="30" /></label><label class="field full">Endereço<input name="address" maxlength="240" /></label><label class="field">Status<select name="status"><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="suspended">Suspenso</option></select></label></div><p class="notice hidden"></p><div class="form-actions"><button class="button button-secondary" type="button" data-close>Cancelar</button><button class="button" type="submit">Salvar alterações</button></div>`;
    Object.entries({ name: tenant.name, public_slug: tenant.public_slug, city: tenant.city || '', phone: tenant.phone || '', address: tenant.address || '', status: tenant.status }).forEach(([key, value]) => { form.elements[key].value = value; });
    const modal = openModal('Editar cliente', 'As alterações são validadas pelo banco e pelas policies RLS.', form);
    form.querySelector('[data-close]').addEventListener('click', modal.close);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); const submit = form.querySelector('[type="submit"]'); const notice = form.querySelector('.notice'); submit.disabled = true;
      const values = Object.fromEntries(new FormData(form).entries()); values.public_slug = values.public_slug.trim().toLowerCase();
      const { error } = await supabase.from('tenants').update(values).eq('id', tenant.id);
      submit.disabled = false;
      if (error) { notice.textContent = 'Não foi possível salvar. Verifique os campos e suas permissões.'; notice.classList.remove('hidden'); return; }
      modal.close(); showToast('Cliente atualizado.'); showView('clients');
    });
  }

  async function toggleTenant(tenant) {
    const nextStatus = tenant.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'active' ? 'Ativar' : 'Desativar'} ${tenant.name}?`)) return;
    const { error } = await supabase.from('tenants').update({ status: nextStatus }).eq('id', tenant.id);
    if (error) return showToast('Não foi possível alterar o status do cliente.', true);
    showToast(nextStatus === 'active' ? 'Cliente ativado.' : 'Cliente desativado.');
    showView('clients');
  }

  async function signOut() { await supabase.auth.signOut(); renderLogin(); }

  async function boot() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return renderLogin();
    currentUser = session.user;
    const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
    if (error) return renderDenied();
    if (profile?.role !== 'super_admin') return window.NfcHubClient.start({ supabase, currentUser, signOut });
    renderShell(); showView('dashboard');
  }

  if (!configured()) return renderSetupRequired();
  supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  supabase.auth.onAuthStateChange((_event, session) => { if (!session) renderLogin(); });
  boot();
})();
