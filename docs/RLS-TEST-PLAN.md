# Roteiro de Homologação RLS

Data: 2026-10-03

## Modelo Aplicado

- `super_admin` tem escopo global por `profiles.role`; não precisa pertencer a um tenant.
- Clientes têm acesso somente por `tenant_memberships`, ao tenant ativo em que possuem associação.
- O contexto de loja escolhido no painel master é apenas interface. A autorização continua no banco por `is_platform_admin()`, `can_access_tenant()` e `can_manage_tenant()`.
- Clientes não recebem grant para alterar `profiles.role`; o único campo atualizável no próprio perfil é `display_name`.
- Associações de usuários e provisionamento de tenants são operações exclusivas de super admin ou `service_role` pela Edge Function.

## Preparação

1. Crie dois tenants ativos: Tenant A e Tenant B.
2. Crie Client A associado apenas ao Tenant A e Client B associado apenas ao Tenant B.
3. Tenha uma conta super admin separada.
4. Registre os UUIDs dos tenants e de pelo menos um botão e logo de cada um.

## Cenários Obrigatórios

| # | Sessão | Ação | Resultado esperado |
|---|---|---|---|
| 1 | Client A | Consultar Tenant B | Negado ou retorno vazio. |
| 2 | Client A | Enviar UUID do Tenant B em atualização de tenant | Negado. |
| 3 | Client A | Alterar, ativar, ordenar ou excluir botão do Tenant B | Negado. |
| 4 | Client A | Chamar `get_tenant_analytics(Tenant B)` | Retorno `null`. |
| 5 | Super admin | Consultar Tenant A | Permitido. |
| 6 | Super admin | Consultar Tenant B | Permitido. |
| 7 | Super admin | Alterar branding, Wi-Fi ou botões do Tenant A | Permitido. |
| 8 | Super admin | Alterar branding, Wi-Fi ou botões do Tenant B | Permitido. |
| 9 | Client A | Tentar atualizar o próprio `profiles.role` para `super_admin` | Negado. |
| 10 | Client A | Tentar criar, editar ou excluir `tenant_memberships` | Negado. |
| 11 | Super admin | Enviar/remover logo em caminho de Tenant A e Tenant B | Permitido. |
| 12 | Client A | Enviar, atualizar ou remover logo no caminho do Tenant B | Negado. |

## Forma de Execução

Use o navegador autenticado com cada conta e as chamadas Supabase do painel ou Console. Testes de negação devem ser feitos alterando manualmente apenas o UUID na requisição; ocultar um botão da interface não é evidência de segurança.

Registre para cada cenário: conta usada, horário, UUID alvo, operação, resposta e resultado. Só marque RLS como homologado após os 12 resultados esperados.

## Controles Verificados no Código

- `is_platform_admin()` valida o papel global no banco.
- `can_access_tenant()` libera super admin ou membro do tenant ativo.
- `can_manage_tenant()` exige super admin ou papel local `owner`/`admin` no tenant ativo.
- Policies de `tenant_buttons`, `wifi_settings` e `storage.objects` chamam as funções de escopo do banco.
- `get_tenant_analytics()` verifica o acesso ao tenant solicitado antes de agregar os dados.
