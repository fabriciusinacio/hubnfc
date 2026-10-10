# NFC Hub

Fundacao de uma plataforma SaaS multi-tenant para placas NFC e QR Code de estabelecimentos. Cada placa abre uma pagina publica configuravel; proprietarios administram somente o seu estabelecimento e a plataforma possui administradores globais.

## Stack

- HTML5, CSS3 e JavaScript vanilla (interface nas proximas etapas)
- Supabase Auth, PostgreSQL, Storage e Row Level Security (RLS)
- Progressive Web App (PWA) nas proximas etapas

Nao ha framework frontend, servidor Node.js ou chave `service_role` no navegador.

## Arquitetura

`auth.users` e a fonte de identidade. A tabela `profiles` complementa o usuario e registra o papel global `super_admin` quando aplicavel. `tenants` representa o estabelecimento e `tenant_memberships` permite varios usuarios por tenant, com papeis locais.

Dados administrativos ficam protegidos por RLS. A pagina publica nao recebe permissoes de leitura direta nas tabelas internas: ela usa `get_public_tenant_page(slug)`, uma RPC que retorna apenas configuracoes ativas e publicaveis. Eventos anonimos usam `record_public_event(...)`, que valida slug, botao e estado antes de gravar. Isso evita que uma chave anonima transforme o banco em uma API de leitura geral.

O acesso de estatisticas no painel usa autenticacao normal. O compartilhamento externo usa uma rota separada com token aleatorio de alta entropia, expiracao de 30 dias, revogacao pela geracao de novo link e escopo somente leitura. IDs sequenciais ou UUIDs de tenant nao sao credenciais.

## Estrutura

```text
supabase/
  migrations/
    202610030001_initial_foundation.sql
    202610030002_admin_panel.sql
    202610030003_bootstrap_super_admin.sql
    202610030004_client_panel_and_public_page.sql
    202610030005_fix_analytics_digest.sql
    202610030006_add_page_view_event.sql
    202610030007_analytics_statistics.sql
    202610030008_fix_whatsapp_button_validation.sql
    202610030009_shared_analytics_links.sql
  functions/
    admin-create-client/
      index.ts
  config.toml
css/
  admin.css
  client.css
  public.css
  stats.css
js/
  admin.js
  client.js
  config.js
  public.js
  analytics.js
  shared-analytics.js
assets/
  pwa-icon.svg
p/
  index.html
stats/
  index.html
manifest.webmanifest
sw.js
docs/
  SECURITY.md
  SECURITY-AUDIT.md
CHECKPOINT.md
README.md
index.html
```

`index.html` identifica o papel do usuario: super admins veem a administracao global, enquanto membros de tenant ativo veem o painel do estabelecimento. A pagina publica usa a URL limpa `p/SEU-SLUG`.

## Configuracao do Supabase

1. Crie um projeto no Supabase e habilite o metodo de login desejado em Authentication.
2. Instale a Supabase CLI e vincule este repositorio ao projeto, ou aplique a migration pelo SQL Editor.
3. Aplique `supabase/migrations/202610030001_initial_foundation.sql`.
4. No navegador, use somente a URL do projeto e a chave anon/publishable. Nunca use `service_role` em HTML ou JavaScript publico.
5. Preencha `js/config.js` com a URL e a chave anon/publishable do projeto.

Exemplo de configuracao futura do cliente:

```js
window.NFC_HUB_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_CHAVE_ANON',
};
```

Esses valores podem ficar em um arquivo local ignorado pelo controle de versao ou serem injetados no deploy. A seguranca depende das policies RLS, nao de esconder a chave anonima.

## Aplicar migrations

Com a CLI configurada:

```powershell
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Alternativamente, cole o conteudo da migration no SQL Editor do projeto. A migration e voltada a uma base nova; valide em ambiente de desenvolvimento antes de producao.

## Painel de super admin

Abra `index.html` por um servidor estatico local ou pelo host de deploy. O painel exige uma sessao autenticada cujo perfil tenha `role = 'super_admin'`; qualquer outra conta recebe uma tela de acesso negado. Os cards e a listagem nao usam dados demonstrativos: eles chamam as RPCs `admin_dashboard_metrics()` e `admin_list_tenants()`.

O painel permite editar dados cadastrais e ativar/desativar tenants. A policy e o trigger no banco continuam sendo a autoridade: manipular um `tenant_id` ou request no navegador nao concede acesso a outro tenant. Quando um tenant nao esta `active`, suas proprias associacoes deixam de autorizar leitura e edicao; super admins continuam conseguindo administra-lo.

## Criacao de clientes

Criar um usuario do Supabase Auth e uma operacao privilegiada. Por isso o modal `+ Criar usuario` chama a Edge Function `admin-create-client`; ele nunca usa a chave `service_role` no browser.

Antes de usar o fluxo, publique a funcao e registre seus secrets no projeto:

```powershell
supabase secrets set SUPABASE_URL=https://SEU-PROJETO.supabase.co
supabase secrets set SUPABASE_ANON_KEY=SUA_CHAVE_ANON
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
supabase functions deploy admin-create-client
```

A funcao valida a sessao chamadora e seu papel `super_admin`, cria o usuario por Auth Admin API, chama `provision_client_tenant(...)` com privilegio de servidor e cria a associacao `owner`. Se o provisionamento falhar, ela exclui a conta acabada de criar. A senha inicial transita somente na requisicao HTTPS e nao e persistida no frontend nem em logs da funcao.

## Primeiro super admin

1. Crie o usuario em Authentication > Users ou pela futura tela de cadastro.
2. Copie o UUID do usuario criado.
3. Execute no SQL Editor, substituindo o UUID:

```sql
insert into public.profiles (id, role, display_name)
values ('UUID_DO_USUARIO', 'super_admin', 'Administrador da plataforma')
on conflict (id) do update set role = 'super_admin';
```

O trigger da migration tambem cria um perfil `user` para novos usuarios. A elevacao a `super_admin` e uma tarefa manual e controlada da plataforma.

## Fluxo de autenticacao e tenants

O usuario autentica pelo Supabase Auth. O dashboard consulta o perfil e as associacoes em `tenant_memberships`. Um usuario comum so le tenants dos quais participa; administradores locais podem editar configuracao, botoes e Wi-Fi do tenant. Somente `super_admin` pode criar, ativar/desativar tenants e administrar associacoes nesta primeira fundacao.

Convites, recuperacao de conta e criacao de usuarios por administradores devem usar Edge Functions, pois requerem privilegios que nao pertencem ao browser. A criacao inicial pelo super admin ja esta coberta por `admin-create-client`.

## Dados e analytics

- `tenant_buttons` armazena botoes configuraveis, ordem, rotulo e payload especifico.
- `wifi_settings` armazena a configuracao de Wi-Fi por tenant.
- `analytics_events` armazena somente eventos anonimizados: tenant, botao opcional, tipo, hash de identificador anonimo e horario.
- A RPC limita visitas repetidas ao mesmo identificador a uma janela de 30 minutos e cliques repetidos a uma janela de 1 minuto.

O hash anonimo e gerado a partir de um identificador aleatorio mantido no dispositivo. Nao ha armazenamento de IP em texto puro, nem de user agent. Rate limiting de borda (WAF/CDN ou Edge Function) continua recomendado antes de producao.

Uma senha de Wi-Fi nao pode ser considerada secreta quando o estabelecimento oferece conexao ao visitante: o dispositivo precisa recebe-la para conectar. Ela fica protegida por RLS no painel administrativo e so e devolvida pela RPC publica quando o botao Wi-Fi ativo torna essa divulgacao intencional. Nao inclua Wi-Fi administrativo ou sensivel nesse recurso.

## Painel do cliente e pagina publica

O painel do cliente permite configurar cada botao, ativar/desativar a exibicao, alterar ordem por controles de subir/descer, configurar Wi-Fi, enviar/remover logo e ajustar as cores e o estilo visual. A pagina publica nao consulta tabelas diretamente: ela chama `get_public_tenant_page(slug)`, que retorna apenas botoes ativos de tenants ativos. Um tenant inativo ou suspenso recebe a tela de indisponibilidade.

Destinos sao normalizados no navegador e novamente validados pela constraint do banco quando um botao e ativado. URLs aceitas sao `https://` e `http://`; telefone exige `tel:+DDI...` e WhatsApp usa `https://wa.me/`. Esquemas como `javascript:` e `data:` sao bloqueados.

O upload de logo aceita somente PNG, JPEG e WebP, com limite de 2 MB, validacao da assinatura inicial do arquivo e caminho aleatorio dentro de `<tenant_id>/`. O Storage e a RLS impedem escrita fora do tenant do usuario autenticado.

Ao ativar Wi-Fi, o estabelecimento confirma que esta divulgando uma rede de convidados. O visitante recebe os dados somente nessa condicao. Android tenta abrir a URI Wi-Fi suportada e disponibiliza um QR Code como alternativa; iOS exibe instrucoes para Ajustes > Wi-Fi e o QR Code. Nenhum navegador pode garantir conexao automatica em todos os dispositivos.

## PWA

A pagina publica registra `sw.js`, cria um manifest dinamico com as cores e o nome do estabelecimento e usa o evento `beforeinstallprompt` quando o navegador oferece instalacao. No iOS, a acao mostra a instrucao correta do Safari. O PWA depende de HTTPS e de um host que entregue os arquivos estaticos com rotas compativeis.

## Estatisticas

Cada abertura da pagina publica registra `page_view`; cliques em botoes registram `button_click`. Eventos antigos `visit` continuam sendo contados para compatibilidade. O banco guarda apenas tenant, botao opcional, tipo, horario e hash SHA-256 de um identificador aleatorio local. Nao ha perfil, nome, e-mail, telefone, IP ou user agent do visitante.

O painel do cliente mostra total de acessos, acessos hoje, 7 e 30 dias, cliques totais, acessos diários e botoes mais clicados. O super admin pode selecionar qualquer cliente na aba Estatisticas. Essas telas usam `get_tenant_analytics(tenant_id)`, uma RPC agregada: eventos brutos e hashes anonimos nao podem ser lidos pelo browser, nem por super admin.

O super admin pode gerar na tela de Estatisticas um link compartilhavel para cada estabelecimento. O token tem 256 bits de entropia, e somente seu hash SHA-256 fica no banco. O link e somente leitura, expira em 30 dias e a geracao de um novo link invalida o anterior. A pagina compartilhada consome `get_shared_tenant_analytics(token)`, que devolve apenas agregados do tenant vinculado ao token. Uma exportacao CSV futura deve consumir a mesma RPC agregada ou uma Edge Function autenticada, nunca a tabela bruta do browser.

## Testes e Limites

Implementado: dashboards de estatisticas, agregacao no banco, graficos SVG, eventos `page_view` e `button_click`, deduplicacao e bloqueio de leitura bruta.

Testado no remoto: login de super admin, dashboard geral, migrations, linter, bloqueio de leitura direta de eventos e recusa de tenant inexistente.

Ainda nao testado: isolamento completo entre dois tenants, upload real, QR Code em aparelhos, PWA instalado e recuperacao de senha. Consulte [a auditoria de seguranca](docs/SECURITY-AUDIT.md) antes do deploy.

## Storage de logos

A migration cria o bucket publico `tenant-logos`. Os objetos sao publicos apenas para renderizar logos nas paginas de visita; escrita e exclusao exigem permissao de administracao no tenant correspondente. O caminho obrigatorio e `<tenant_id>/<arquivo>`. Valide MIME type, tamanho e dimensoes no upload futuro; use nomes aleatorios e nao confie na extensao.

## Seguranca

- RLS habilitado em todas as tabelas expostas.
- Policies verificam `auth.uid()`, associacao ao tenant e papel global no banco.
- Funcoes RPC usam `security definer`, `search_path` fixo e retornam o menor conjunto de dados publico necessario.
- URLs externas devem ser aceitas apenas com protocolos permitidos (`https:` e, onde apropriado, `tel:`, `mailto:` e `https://wa.me/`), normalizadas e renderizadas sem `innerHTML`.
- A aplicacao deve usar `textContent` para conteudo inserido pelo usuario e `rel="noopener noreferrer"` em links externos abertos em nova aba.
- CSRF nao se aplica a chamadas autenticadas com bearer token do Supabase, mas origem, redirecionamentos de Auth e CORS devem ser configurados no projeto.

## Proximas etapas

1. Configurar o projeto Supabase e aplicar a migration em desenvolvimento.
2. Implementar a pagina publica mobile-first e o cliente Supabase vanilla.
3. Implementar autenticacao e dashboards de super admin e cliente.
4. Criar Edge Functions para convites, operacoes administrativas privilegiadas e protecao adicional de analytics.
5. Adicionar PWA, QR Code, testes e pipeline de deploy.
