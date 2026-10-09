# Deploy na Hostinger

## Arquivos

Publique o conteúdo deste projeto na raiz do domínio, normalmente `public_html/`. Mantenha o arquivo `.htaccess` na mesma raiz de `index.html`; ele força HTTPS, adiciona cabeçalhos de segurança e permite a URL pública `/p/slug`.

Não publique arquivos `.env`, credenciais de banco, tokens pessoais ou chaves `service_role`.

## Domínio e HTTPS

1. Aponte o domínio para a hospedagem e ative o certificado SSL no painel da Hostinger.
2. Confirme que `https://SEU-DOMINIO/` abre o painel e que `https://SEU-DOMINIO/p/slug-da-loja` abre uma página pública.
3. A aplicação deve ficar na raiz do domínio. Os links públicos e compartilhados usam a origem atual do navegador e passam a usar o domínio automaticamente.

## Supabase Auth

Em **Authentication > URL Configuration** no Supabase, configure:

- Site URL: `https://SEU-DOMINIO`
- Redirect URLs: `https://SEU-DOMINIO` e `https://SEU-DOMINIO/**`

Mantenha a URL local apenas enquanto precisar desenvolver: `http://localhost:4173`.

## Edge Function

Antes de publicar a nova versão de `admin-create-client`, defina a allowlist com o domínio final:

```powershell
supabase secrets set ALLOWED_ORIGINS=https://SEU-DOMINIO,http://localhost:4173
supabase functions deploy admin-create-client
```

O navegador em produção deve usar somente `https://SEU-DOMINIO`. Remova `localhost` da allowlist quando o desenvolvimento local não for mais necessário.

## Validação Final

1. Faça login como super admin e crie um cliente.
2. Abra uma página pública por NFC/QR em HTTPS.
3. Gere e abra um link compartilhado de estatísticas.
4. Instale o PWA em um celular.
5. Confirme que uma rota `/p/slug` funciona após o upload.
