# Checkpoint

## Status atual

- [x] Arquitetura
- [x] Banco
- [x] Auth
- [x] Multi-tenant
- [x] RLS
- [x] Dashboard Admin
- [x] Dashboard Cliente
- [x] Pagina publica
- [x] Botoes
- [x] Wi-Fi
- [x] Criar atalho
- [x] Analytics
- [x] PWA
- [x] Upload de logo
- [x] Personalizacao
- [x] QR Code
- [x] Testes
- [x] Seguranca
- [x] Gerenciador de placas NFC
- [x] QR Codes permanentes e impressao em PDF
- [ ] Deploy

## O que foi feito

- Modelagem inicial PostgreSQL para perfis, tenants, associacoes, botoes, Wi-Fi e analytics.
- Indices, constraints, trigger de perfil, funcoes auxiliares de autorizacao e RPCs publicas.
- RLS e policies para isolamento por tenant e administracao global.
- Bucket e policies de Storage para logos de tenants.
- Documentacao de configuracao, seguranca e operacao inicial.
- Painel de super admin responsivo com login, dashboard, listagem, edicao e alteracao de status de clientes.
- Edge Function protegida para criar usuario responsavel, tenant e associacao de proprietario.
- Migration para dados cadastrais do tenant e bloqueio de acesso do cliente quando o tenant nao estiver ativo.
- Migrations `202610030001` e `202610030002` aplicadas no projeto Supabase remoto em 2026-10-03.
- Edge Function `admin-create-client` publicada no projeto Supabase remoto.
- Primeiro super admin criado e validado por login e RPCs administrativas em 2026-10-03.
- Painel do cliente com configuracao de botoes, ativacao, ordenacao, Wi-Fi, logo e personalizacao.
- Pagina publica protegida por RPC, exibindo apenas botoes ativos de tenants ativos.
- PWA, manifest dinamico, service worker e fluxo Wi-Fi com QR Code implementados.
- Migration `202610030004` aplicada no projeto Supabase remoto em 2026-10-03, com autorizacao para divulgar credenciais de rede de convidados quando o botao Wi-Fi estiver ativo.
- Migration `202610030005` aplicada e linter remoto concluido sem erros de schema em 2026-10-03.
- Estatisticas agregadas por tenant implementadas para cliente e super admin; eventos brutos nao sao mais legiveis pelo frontend.
- Migrations `202610030006` e `202610030007` aplicadas e linter remoto concluido sem erros em 2026-10-03.
- Correcao do cadastro administrativo: pattern de slug compativel com Chrome atual e mensagens detalhadas da Edge Function publicadas em 2026-10-03.
- Migration `202610030008` aplicada: validacao de `wa.me` corrigida e mensagem opcional passa a compor o redirecionamento direto do WhatsApp.
- Correcao visual: Instagram usa icone de camera e Facebook usa icone de curtir no painel e na pagina publica.
- Fluxo de cadastro de cliente e validacao de slug sem espacos confirmado pelo usuario em 2026-10-03.
- Homologacao manual confirmada pelo usuario em 2026-10-03: criacao de dois usuarios, botoes, WhatsApp, Facebook, avaliacoes, PWA, QR Code, Wi-Fi, atalho, analytics e pagina publica.
- Super admin pode abrir a configuracao completa de qualquer loja pela lista de clientes, mantendo a propria sessao e retornando ao painel master sem novo login.
- Area "Links uteis" no master inclui atalho para a ferramenta oficial do Google Place ID.
- Upload de logo, personalizacao visual e testes de homologacao confirmados pelo usuario em 2026-10-03.
- Compartilhamento de analytics por link temporario e revogavel implementado; migration `202610030009` aplicada no Supabase remoto e linter concluido sem erros em 2026-10-03.
- Arquivos de preparacao para deploy Hostinger adicionados: HTTPS, cabecalhos, rota `/p/slug`, CORS por allowlist e roteiro de configuracao externa.
- Fluxo Wi-Fi ajustado: navegadores nao tentam mais abrir um esquema `WIFI:` sem suporte; exibem QR Code e permitem copiar os dados da rede.
- Gerenciador global de placas NFC adicionado ao painel do super admin: modelos de arte privados, lotes, estoque, filtros, historico e transicoes controladas de status.
- Cada unidade recebe um codigo visual sequencial (`PL-000001`) e um codigo publico aleatorio de 192 bits, usado na URL permanente `/r/<codigo>` e no QR Code.
- A resolucao publica da placa ocorre somente por RPC: apenas placas ativas vinculadas a tenants ativos redirecionam para a pagina publica; estoque, arte, historico e identificadores internos nao sao expostos.
- PDF de impressao em tamanho configuravel (padrao 100 x 150 mm), QR Code real, numero visual e reimpressao individual sem criar um novo codigo implementados.
- Arte padrao de placa definida em proporcao 10 x 15 cm: QR gerado centralizado sobre a moldura decorativa em X 50%, Y 73%, com 37% da largura da arte.
- Editor visual do QR na arte: arrastar move a area do QR e o puxador no canto redimensiona, com sincronizacao imediata para os campos e para o PDF final.
- Biblioteca privada de artes recebeu os modelos `QR Duplo Preto` e `QR Duplo Claro`, selecionaveis no momento de gerar um lote.
- QR duplo dinamico implementado: `Acessar` usa URL permanente configuravel por placa e `Wi-Fi` abre uma pagina dinamica com a rede atual do cliente, sem reimpressao apos troca de senha ou SSID.
- Migrations `202610100010` e `202610100011` aplicadas no Supabase remoto em 2026-10-10; linter remoto concluido sem erros de schema.
- Migration `202610100012` aplicada no Supabase remoto em 2026-10-10 para fixar essa configuracao como padrao no banco; linter remoto sem erros.

## Arquivos criados

- `README.md`
- `CHECKPOINT.md`
- `.gitignore`
- `.htaccess`
- `docs/SECURITY.md`
- `docs/DEPLOY-HOSTINGER.md`
- `supabase/config.toml`
- `supabase/migrations/202610030001_initial_foundation.sql`
- `supabase/migrations/202610030002_admin_panel.sql`
- `supabase/migrations/202610030003_bootstrap_super_admin.sql`
- `supabase/migrations/202610030004_client_panel_and_public_page.sql`
- `supabase/migrations/202610030005_fix_analytics_digest.sql`
- `supabase/migrations/202610030006_add_page_view_event.sql`
- `supabase/migrations/202610030007_analytics_statistics.sql`
- `supabase/migrations/202610030008_fix_whatsapp_button_validation.sql`
- `supabase/migrations/202610030009_shared_analytics_links.sql`
- `supabase/functions/admin-create-client/index.ts`
- `index.html`
- `css/admin.css`
- `js/admin.js`
- `js/config.js`
- `js/client.js`
- `js/public.js`
- `js/analytics.js`
- `js/shared-analytics.js`
- `css/client.css`
- `css/public.css`
- `css/stats.css`
- `p/index.html`
- `stats/index.html`
- `assets/pwa-icon.svg`
- `manifest.webmanifest`
- `sw.js`
- `docs/SECURITY-AUDIT.md`
- `docs/RLS-TEST-PLAN.md`
- `css/plates.css`
- `js/plates.js`
- `js/plate-redirect.js`
- `r/index.html`
- `supabase/migrations/202610100010_nfc_plate_inventory.sql`
- `supabase/migrations/202610100011_nfc_plate_batch_lint.sql`

## Migrations criadas

- `202610030001_initial_foundation.sql`: fundacao do banco, RLS, Storage e RPCs publicas.
- `202610030002_admin_panel.sql`: dados cadastrais, RPCs administrativas e bloqueio de tenant inativo.
- `202610030003_bootstrap_super_admin.sql`: primeiro perfil de super admin da plataforma.
- `202610030004_client_panel_and_public_page.sql`: painel do cliente, validacoes de publicacao e pagina publica controlada.
- `202610030005_fix_analytics_digest.sql`: correcao de schema para o hash de analytics no Supabase.
- `202610030006_add_page_view_event.sql`: evento `page_view` para novas visualizacoes publicas.
- `202610030007_analytics_statistics.sql`: agregados protegidos, dashboards e bloqueio de leitura bruta de eventos.
- `202610030008_fix_whatsapp_button_validation.sql`: correcao de validacao para destino do WhatsApp.
- `202610030009_shared_analytics_links.sql`: links temporarios, revogaveis e somente leitura para estatisticas compartilhadas.
- `202610100010_nfc_plate_inventory.sql`: estoque global de placas, modelos de arte, bucket privado, historico, RLS e RPCs de lote, vinculo e resolucao publica.
- `202610100011_nfc_plate_batch_lint.sql`: ajuste interno da RPC de geracao de lotes para validacao limpa do schema.
- `202610100012_default_nfc_plate_art_position.sql`: posicao e tamanho padrao do QR para a arte 10 x 15 cm aprovada.
- `202610100014_seed_dual_qr_art_templates.sql`: cadastro dos dois modelos de arte QR duplo enviados ao bucket privado.
- `202610100015_dual_qr_dynamic_plates.sql`: segundo codigo permanente por placa, rotas dinamicas de URL e Wi-Fi, e configuracao de destino do QR de acesso.

## Pendencias

- Implementar Edge Functions para convites e limite de taxa na borda.
- Definir politica de retencao e agregacao de analytics antes de producao.
- Configurar regras de rota no host para servir `p/index.html` em URLs amigaveis como `/p/slug`, se desejado.
- Homologar no navegador um modelo de arte PNG/JPEG, um lote pequeno, ativacao em uma loja e leitura do QR pelo celular antes da primeira impressao fisica.

## Proximo passo

Preparar o ambiente de producao: controle de abuso, privacidade, recuperacao de senha, convites e deploy.

## MVP Status

### Funcionalidades Concluidas

- Fundacao multi-tenant, RLS, Auth de super admin, painel administrativo, migrations remotas e bloqueio de leitura bruta de analytics.
- Acesso ao painel do cliente e cadastro de cliente pelo fluxo administrativo.
- Criacao de usuarios, botoes, WhatsApp, Facebook, avaliacoes, PWA, QR Code, Wi-Fi, atalho, analytics e pagina publica homologados manualmente.

### Funcionalidades Pendentes

- Recuperacao de senha com tela dedicada, convites, exportacao CSV, rate limiting de borda, deploy e homologacao fisica das placas NFC.

### Bugs Conhecidos

- Nenhum erro conhecido apos o linter remoto e a homologacao manual dos fluxos principais.
- O erro de validacao do WhatsApp foi corrigido pela migration `202610030008` e o fluxo foi confirmado pelo usuario.

### Riscos de Seguranca

- Wi-Fi ativo divulga a senha da rede de convidados por decisao explicitamente autorizada.
- CORS da Edge Function deve ser restringido ao dominio de producao antes do deploy.
- Falta rate limiting contra bots distribuidos nos eventos publicos.

### Proximos Passos

- Configurar controle de abuso, privacidade, recuperacao de senha, convites e deploy.
