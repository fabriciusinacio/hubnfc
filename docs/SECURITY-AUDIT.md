# Auditoria de Segurança do MVP

Data: 2026-10-03

## Validado

- Login do super admin e RPC `admin_dashboard_metrics()` validados no projeto remoto.
- As migrations foram aplicadas e o linter remoto concluiu sem erros de schema.
- Leitura direta de `analytics_events` foi negada inclusive ao super admin autenticado; dashboards usam apenas a RPC agregada `get_tenant_analytics()`.
- A RPC de estatísticas retorna `null` para tenant inexistente.
- Nenhum arquivo frontend contém `service_role` ou `SUPABASE_SERVICE_ROLE_KEY`.

## Controles Implementados

- Auth do Supabase e perfis com `super_admin`.
- RLS em tabelas de tenant, memberships, botões, Wi-Fi e Storage.
- Funções `security definer` com `search_path` fixo para acesso público e agregados.
- Página pública sem acesso direto às tabelas internas e com filtros de tenant ativo/botão ativo.
- Eventos anonimizados com SHA-256 do identificador local, sem nome, e-mail, telefone, IP ou user agent.
- Deduplicação: page views por visitante a cada 30 minutos; cliques por visitante e botão a cada 1 minuto.
- URLs e esquemas perigosos bloqueados no cliente e por constraint ao ativar botões.
- Logo limitada a PNG, JPEG ou WebP, máximo de 2 MB, validação de assinatura e caminho por tenant.

## Riscos e Limitações

- Wi-Fi de convidados: ao ativar o botão, SSID, senha e QR Code ficam disponíveis a qualquer visitante da página pública. Nunca use rede interna.
- A deduplicação reduz atualização acidental, mas não bloqueia bots distribuídos. Antes da produção, adicione WAF/CDN ou Edge Function com rate limit por IP/origem.
- A Edge Function de criação de clientes usa CORS permissivo para suportar a prévia local. Antes de produção, configure uma lista de origens permitidas no deploy.
- Recuperação de senha ainda depende do fluxo padrão do Supabase; não há tela dedicada no MVP.
- Content Security Policy, domínios de redirect do Auth e HTTPS são responsabilidades obrigatórias do host de produção.

## Testes Pendentes

Os cenários Tenant A versus Tenant B não foram executados porque não há tenants de teste autorizados no projeto remoto. Antes do deploy, crie dois clientes de teste e valide leitura, atualização, exclusão, Storage e `get_tenant_analytics()` com as duas sessões.

## Revisão Complementar - 2026-10-03

### Resultado

- Nenhuma chave `service_role`, senha de usuário ou token administrativo foi encontrada nos arquivos versionados.
- A chave `sb_publishable_...` em `js/config.js` pode permanecer pública: ela não concede privilégios por si só; a proteção depende de RLS, grants e RPCs.
- O frontend insere dados configuráveis como texto e os destinos externos passam por normalização. Não foi identificado caminho direto de XSS pelos campos atuais.
- RLS está habilitada nas tabelas expostas; a página pública usa RPC com retorno limitado, e o browser não lê eventos brutos de analytics.
- O linter remoto não foi reexecutado nesta revisão porque a sessão local da CLI não possui credenciais de banco válidas. O último linter remoto registrado no projeto concluiu sem erros de schema.

### Achados para Resolver Antes do Deploy

1. **Rotacionar credenciais compartilhadas fora do repositório.** Qualquer chave administrativa ou token `sbp_...` enviado por chat, e-mail ou captura de tela deve ser considerado potencialmente comprometido. Revogue-o e gere outro no Supabase; guarde o novo apenas no gerenciador de segredos e em variáveis de ambiente locais.
2. **Restringir CORS da Edge Function.** `admin-create-client` aceita qualquer origem durante desenvolvimento. Em produção, `Access-Control-Allow-Origin` deve permitir apenas os domínios reais do painel.
3. **Adicionar proteção de borda.** As RPCs públicas de página e analytics podem ser chamadas em volume por qualquer visitante. Configure rate limit e proteção contra abuso no host, CDN/WAF ou Edge Function.
4. **Adicionar cabeçalhos de segurança no host.** Defina CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e HTTPS com HSTS. A aplicação atual não controla esses cabeçalhos por HTML estático.
5. **Fixar dependências externas.** O painel carrega bibliotecas por CDN, incluindo `lucide@latest`. Fixe versões e, quando possível, use SRI ou hospede os arquivos no próprio deploy para reduzir risco de cadeia de suprimentos.
6. **Permitir somente HTTPS para links externos.** O banco e o cliente ainda aceitam destinos `http://`. Antes do deploy, restrinja botões web, menu, redes sociais e localização a `https://`; mantenha `tel:` apenas para telefone.

### LGPD e Privacidade

- O projeto trata dados pessoais de contas administrativas, como nome e e-mail, e o identificador persistente de analytics deve ser considerado dado pseudonimizado. O hash reduz exposição, mas não elimina as obrigações de privacidade.
- Antes da produção, publique aviso de privacidade acessível na página pública e no painel, indicando controlador e operador, categorias de dados, finalidade, base legal, compartilhamentos, retenção e canal para exercício de direitos.
- Formalize os papéis com cada estabelecimento e com o provedor de infraestrutura: em geral, o estabelecimento tende a ser controlador dos dados de sua operação, e a plataforma pode atuar como operadora, mas isso depende do contrato e da definição efetiva das finalidades.
- Defina base legal e período de retenção para analytics; ofereça mecanismo de oposição ou consentimento quando a avaliação jurídica concluir que ele é necessário. Não use analytics para publicidade comportamental sem uma base legal apropriada.
- Crie rotina documentada de resposta a incidentes, exportação/correção/exclusão de dados e canal de contato do titular. A revisão jurídica dos termos, contrato e aviso de privacidade continua necessária.

### Referências

- A LGPD exige medidas técnicas e administrativas desde a concepção do serviço; consulte a [Lei nº 13.709/2018](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).
- O [Guia de Segurança da Informação da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/processo-guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte.pdf) traz controles adequados também para agentes de pequeno porte.
