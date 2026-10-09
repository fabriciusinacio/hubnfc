(() => {
  const root = document.querySelector('#shared-analytics');
  const config = window.NFC_HUB_CONFIG || {};

  function state(title, description) {
    root.innerHTML = '<section class="shared-state"><h1></h1><p></p></section>';
    root.querySelector('h1').textContent = title;
    root.querySelector('p').textContent = description;
  }

  async function boot() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return state('Estatísticas indisponíveis', 'Esta página ainda não está configurada.');
    const token = new URLSearchParams(location.search).get('token') || '';
    if (!/^[0-9a-f]{64}$/.test(token)) return state('Link inválido', 'Solicite um novo link de estatísticas ao administrador.');

    const api = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await api.rpc('get_shared_tenant_analytics', { requested_token: token });
    if (error || !data) return state('Link indisponível', 'Este link expirou ou foi substituído por um novo.');

    document.title = `Estatísticas | ${data.tenant_name}`;
    const header = document.createElement('header'); header.className = 'shared-header';
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'DESEMPENHO';
    const title = document.createElement('h1'); title.textContent = data.tenant_name;
    const description = document.createElement('p'); description.textContent = 'Acessos e interações da sua página pública.';
    header.append(eyebrow, title, description);
    const content = document.createElement('section'); content.className = 'shared-content';
    root.replaceChildren(header, content);
    window.NfcHubAnalytics.render(content, data);
  }

  boot();
})();
