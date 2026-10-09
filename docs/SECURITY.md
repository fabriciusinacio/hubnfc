# Decisoes de seguranca

## Limites de confianca

O navegador e um cliente nao confiavel. Ocultar elementos na interface nao concede seguranca: toda autorizacao acontece no PostgreSQL via RLS e nas RPCs. A chave anon/publishable pode estar no frontend; a `service_role` nunca pode.

## Provisionamento administrativo

O painel nao cria usuarios chamando o Auth Admin API diretamente. A Edge Function `admin-create-client` recebe o token da sessao, consulta o perfil pelo backend e exige `super_admin` antes de usar `SUPABASE_SERVICE_ROLE_KEY`, mantida apenas nos secrets da funcao. Ela cria o usuario, chama a RPC exclusiva de `service_role` para inserir tenant e associacao `owner` e remove o usuario se a segunda etapa falhar. Restrinja `Access-Control-Allow-Origin` ao dominio final do painel antes do deploy de producao.

O status do tenant e validado no trigger do banco. Usuarios locais deixam de acessar dados quando o tenant e inativado ou suspenso; somente super admins ainda o administram. A alteracao de `tenant_id` jamais e aceita como mecanismo de troca de contexto no frontend.

## Acesso publico

Nao existem policies de `select` publicas em `tenants`, `tenant_buttons` ou `wifi_settings`. A RPC `get_public_tenant_page` filtra tenant ativo, botao ativo e campos explicitamente permitidos. A RPC `record_public_event` valida que o botao pertence ao tenant e esta ativo antes de registrar um evento.

## Wi-Fi

A senha e um dado operacionalmente sensivel no painel, mas deixa de ser secreta quando a rede e disponibilizada ao visitante. O recurso so deve ser habilitado para redes de convidados. A interface deve pedir confirmacao explicita antes de exibir ou copiar a senha e explicar as limitacoes do iOS e Android; nao deve prometer conexao automatica universal.

## Analytics e abuso

O banco deduplica visitas por 30 minutos e cliques por 1 minuto, usando hash SHA-256 de um identificador aleatorio do dispositivo. Isto reduz duplicacao acidental, mas nao substitui rate limiting contra bots distribuídos. Antes de producao, aplique limite por IP/origem em CDN, WAF ou Edge Function e defina retencao dos eventos brutos.

## Links compartilhados de estatisticas

O super admin pode gerar um link somente leitura para um tenant. O banco armazena somente o hash SHA-256 do token aleatorio de 256 bits; o token original aparece apenas na resposta de criacao, para ser copiado. Cada tenant possui um link ativo por vez, com validade de 30 dias. Gerar um novo link substitui o hash anterior e o revoga imediatamente. A RPC publica vinculada ao token devolve somente agregados de analytics e o nome do estabelecimento; nunca retorna eventos brutos, usuarios, membros ou configuracoes internas.

## Uploads

O bucket de logos e publico para permitir o carregamento na pagina de visita. As policies restringem escrita ao caminho do tenant e a administradores daquele tenant. O frontend futuro deve limitar arquivos a imagens, impor tamanho maximo, validar a decodificacao e gerar nome aleatorio. Para logos que nao devam ser publicos, use bucket privado e URLs assinadas em fluxo separado.

## URLs e XSS

URLs, labels e cores sao dados fornecidos pelo usuario. Validar protocolos no cliente e, quando houver backend, no servidor. Inserir texto via `textContent`; nunca montar HTML com valores de tenant. Ao abrir destino externo, usar `noopener noreferrer`. O Content Security Policy deve ser definido no host de deploy.
