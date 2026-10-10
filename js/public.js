(() => {
  const root = document.querySelector('#public-app');
  const config = window.NFC_HUB_CONFIG || {};
  const labels = { google_review: ['star', 'Avaliar no Google'], instagram: ['camera', 'Instagram'], facebook: ['thumbs-up', 'Facebook'], website: ['globe-2', 'Nosso site'], menu: ['utensils', 'Cardápio'], whatsapp: ['message-circle', 'WhatsApp'], phone: ['phone', 'Telefone'], location: ['map-pin', 'Localização'], wifi: ['wifi', 'Conectar Wi-Fi'], add_to_home: ['plus-square', 'Adicionar à tela inicial'], custom: ['link', 'Abrir link'] };
  let api; let page; let installPrompt;
  const icons = () => window.lucide?.createIcons();
  function anonymousId() { let id = localStorage.getItem('nfc-hub-anonymous-id'); if (!id) { id = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('nfc-hub-anonymous-id', id); } return id; }
  function track(type, buttonId = null) { return api.rpc('record_public_event', { requested_slug: page.slug, requested_event: type, requested_button_id: buttonId, anonymous_id: anonymousId() }); }
  function state(title, description) { root.innerHTML = '<section class="public-state"><h1></h1><p></p></section>'; root.querySelector('h1').textContent = title; root.querySelector('p').textContent = description; }
  function safeDestination(value) { try { const url = new URL(value); return ['https:', 'http:', 'tel:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function appIcon(logoUrl, color, name) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext('2d'); context.fillStyle = color || '#176b4d'; context.fillRect(0, 0, 512, 512);
      const fallback = () => { context.fillStyle = '#ffffff'; context.font = '700 290px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText((name || 'N').trim().charAt(0).toUpperCase(), 256, 274); canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'); };
      if (!logoUrl) return fallback();
      const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => { const scale = Math.min(400 / image.naturalWidth, 400 / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale; context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height); canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'); }; image.onerror = fallback; image.src = logoUrl;
    });
  }
  function wifiPayload(data) { const escape = (value) => String(value).replace(/([\\;,:"])/g, '\\$1'); const type = data.security_type === 'nopass' ? 'nopass' : data.security_type.replace(/[23]/g, ''); return `WIFI:T:${type};S:${escape(data.ssid)};P:${escape(data.password)};H:${data.hidden ? 'true' : 'false'};;`; }
  function appendQr(box, data) {
    if (box.querySelector('.wifi-qr')) return;
    const section = document.createElement('div'); section.className = 'wifi-qr';
    const description = document.createElement('p'); description.textContent = 'Use este QR Code em outro aparelho ou compartilhe a tela para conectar à rede.';
    const canvas = document.createElement('div'); canvas.className = 'qr-canvas';
    section.append(description, canvas); box.append(section);
    if (window.QRCode) {
      new window.QRCode(canvas, { text: wifiPayload(data), width: 176, height: 176, correctLevel: window.QRCode.CorrectLevel.M });
    } else {
      const fallback = document.createElement('span'); fallback.className = 'qr-unavailable'; fallback.textContent = 'QR Code indisponível. Use os dados da rede acima.'; canvas.append(fallback);
    }
  }

  async function copyWifiDetails(data) {
    const text = `Rede: ${data.ssid}\nSenha: ${data.password}`;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
      const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
      const copied = document.execCommand('copy'); input.remove(); return copied;
    } catch { return false; }
  }
  async function copyWifiPassword(data) {
    if (data.security_type === 'nopass') return true;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(data.password); return true; }
      const input = document.createElement('textarea'); input.value = data.password; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); return copied;
    } catch { return false; }
  }
  function tryOpenWifiSettings(android) {
    if (!android) return false;
    location.href = 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
    return true;
  }
  function openWifi() {
    const data = page.wifi; if (!data) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent); const android = /Android/.test(navigator.userAgent);
    const overlay = document.createElement('div'); overlay.className = 'wifi-modal'; const box = document.createElement('section'); box.className = 'wifi-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2'); title.textContent = 'Conectar ao Wi-Fi';
    const copy = document.createElement('p'); copy.textContent = ios ? 'No iPhone, abra Ajustes > Wi-Fi e selecione esta rede.' : android ? 'No Android, abra as configurações de Wi-Fi e selecione esta rede.' : 'Abra as configurações de Wi-Fi do dispositivo e selecione esta rede.';
    const details = document.createElement('div'); details.className = 'wifi-details'; details.textContent = `Rede: ${data.ssid}`; const password = document.createElement('strong'); password.textContent = data.security_type === 'nopass' ? 'Rede sem senha' : `Senha: ${data.password}`; details.append(password);
    const actions = document.createElement('div'); actions.className = 'wifi-actions'; const tryButton = document.createElement('button'); tryButton.textContent = android ? 'Abrir configurações Wi-Fi' : 'Ver QR de conexão'; tryButton.addEventListener('click', () => { if (tryOpenWifiSettings(android)) return; appendQr(box, data); tryButton.textContent = 'Escaneie o QR abaixo'; }); actions.append(tryButton); const copyButton = document.createElement('button'); copyButton.className = 'secondary'; copyButton.textContent = data.security_type === 'nopass' ? 'Rede sem senha' : 'Copiar senha e abrir Wi-Fi'; copyButton.disabled = data.security_type === 'nopass'; copyButton.addEventListener('click', async () => { const copied = await copyWifiPassword(data); if (!copied) { copyButton.textContent = 'Não foi possível copiar'; return; } copyButton.textContent = 'Senha copiada'; if (!tryOpenWifiSettings(android) && ios) copy.textContent = 'Senha copiada. Agora abra Ajustes > Wi-Fi e selecione esta rede.'; }); actions.append(copyButton); const detailsButton = document.createElement('button'); detailsButton.className = 'secondary'; detailsButton.textContent = 'Copiar dados'; detailsButton.addEventListener('click', async () => { const copied = await copyWifiDetails(data); detailsButton.textContent = copied ? 'Dados copiados' : 'Não foi possível copiar'; }); actions.append(detailsButton);
    const close = document.createElement('button'); close.className = 'secondary'; close.textContent = 'Fechar'; close.addEventListener('click', () => overlay.remove()); actions.append(close);
    box.append(title, copy, details); appendQr(box, data); box.append(actions); overlay.append(box); root.append(overlay);
  }
  async function install() { await track('install_prompt'); if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; } if (/iPad|iPhone|iPod/.test(navigator.userAgent)) { const overlay = document.createElement('div'); overlay.className = 'wifi-modal'; overlay.innerHTML = '<section class="wifi-box"><h2>Adicionar à tela inicial</h2><p>No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.</p><div class="wifi-actions"><button class="secondary">Fechar</button></div></section>'; overlay.querySelector('button').addEventListener('click', () => overlay.remove()); root.append(overlay); } }
  function installHelp() { const overlay = document.createElement('div'); overlay.className = 'wifi-modal'; overlay.innerHTML = '<section class="wifi-box"><h2>Adicionar a tela inicial</h2><p>O navegador ainda nao liberou a instalacao. Abra o menu do Chrome e escolha Instalar aplicativo ou Adicionar a tela inicial.</p><div class="wifi-actions"><button class="secondary">Fechar</button></div></section>'; overlay.querySelector('button').addEventListener('click', () => overlay.remove()); root.append(overlay); }
  const browserInstall = install;
  install = async () => { const promptWasAvailable = Boolean(installPrompt); await browserInstall(); if (!promptWasAvailable && !/iPad|iPhone|iPod/.test(navigator.userAgent)) installHelp(); };
  function render() {
    document.title = page.name; document.querySelector('meta[name="theme-color"]').content = page.theme.primary_color; root.replaceChildren();
    const card = document.createElement('section'); card.className = 'public-card'; card.style.background = page.theme.background_color; card.style.color = page.theme.text_color;
    const identity = document.createElement('header'); identity.className = 'public-identity';
    if (page.logo_path) { const image = document.createElement('img'); image.className = 'public-logo'; image.src = api.storage.from('tenant-logos').getPublicUrl(page.logo_path).data.publicUrl; image.alt = `Logo de ${page.name}`; identity.append(image); } else { const fallback = document.createElement('div'); fallback.className = 'public-fallback'; fallback.style.background = page.theme.primary_color; fallback.textContent = page.name.trim().charAt(0).toUpperCase(); identity.append(fallback); }
    const name = document.createElement('h1'); name.textContent = page.name; identity.append(name); const menu = document.createElement('nav'); menu.className = 'public-menu';
    page.buttons.forEach((button) => { const control = document.createElement('button'); const [iconName, defaultLabel] = labels[button.kind] || labels.custom; control.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`; const text = document.createElement('span'); text.textContent = button.label || defaultLabel; control.append(text); control.style.background = page.theme.button_style === 'outline' ? 'transparent' : page.theme.primary_color; control.style.color = page.theme.button_style === 'outline' ? page.theme.primary_color : '#fff'; control.style.borderColor = page.theme.primary_color; control.addEventListener('click', async () => { if (button.kind === 'wifi') { await track('button_click', button.id); openWifi(); return; } if (button.kind === 'add_to_home') { install(); return; } const destination = safeDestination(button.target_url); if (!destination) return; await track('button_click', button.id); location.href = destination; }); menu.append(control); });
    const footer = document.createElement('footer'); footer.className = 'public-footer'; footer.textContent = 'NFC Hub'; card.append(identity, menu, footer); root.append(card); icons();
  }
  async function boot() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return state('Configuração indisponível', 'Esta página ainda não está configurada.'); api = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const query = new URLSearchParams(location.search); const slug = query.get('slug') || location.pathname.split('/').filter(Boolean).pop(); if (!slug || slug === 'p' || slug === 'index.html') return state('Página não encontrada', 'Use o link completo fornecido pelo estabelecimento.');
    const { data, error } = await api.rpc('get_public_tenant_page', { requested_slug: slug }); if (error || !data) return state('Página não encontrada', 'Este estabelecimento não está disponível.'); if (data.availability === 'unavailable') return state('Este estabelecimento está temporariamente indisponível.', 'Tente novamente em outro momento.'); page = data;
    const logoIcon = page.logo_path ? api.storage.from('tenant-logos').getPublicUrl(page.logo_path).data.publicUrl : '';
    const generatedIcon = await appIcon(logoIcon, page.theme.primary_color, page.name);
    const defaultIcon = new URL('../assets/pwa-icon.svg', location.href).href;
    const manifest = {
      name: page.name,
      short_name: page.name.slice(0, 12),
      start_url: location.href,
      display: 'standalone',
      background_color: page.theme.background_color,
      theme_color: page.theme.primary_color,
      icons: generatedIcon
        ? [{ src: generatedIcon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }, { src: defaultIcon, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
        : [{ src: defaultIcon, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    };
    document.querySelector('link[rel="manifest"]').href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
    render(); track('page_view');
  }
  const initialQuery = new URLSearchParams(location.search); const initialSlug = initialQuery.get('slug'); if (initialSlug) localStorage.setItem('nfc-hub-installed-slug', initialSlug); else if (initialQuery.has('installed')) { const savedSlug = localStorage.getItem('nfc-hub-installed-slug'); if (savedSlug) history.replaceState(null, '', `${location.pathname}?slug=${encodeURIComponent(savedSlug)}`); }
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('appinstalled', () => { if (page) track('install_prompt'); });
  boot();
})();
