(() => {
  const root = document.querySelector('#redirect-app');
  const config = window.NFC_HUB_CONFIG || {};
  const state = (title, description) => { root.innerHTML = '<section class="public-state"><h1></h1><p></p></section>'; root.querySelector('h1').textContent = title; root.querySelector('p').textContent = description; };
  async function boot() {
    const code = new URLSearchParams(location.search).get('code') || location.pathname.split('/').filter(Boolean).pop() || '';
    if (!config.supabaseUrl || !config.supabaseAnonKey || !/^[a-f0-9]{24}$/.test(code)) return state('Placa indisponível', 'Este QR Code não é válido.');
    const api = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await api.rpc('resolve_nfc_plate_destination', { requested_code: code });
    if (error || !data?.value) return state('Placa indisponível', 'Esta placa ainda não foi ativada ou está desativada.');
    location.replace(data.kind === 'url' ? data.value : `../p/${encodeURIComponent(data.value)}`);
  }
  boot();
})();
