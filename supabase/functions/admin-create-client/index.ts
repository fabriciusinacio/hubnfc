import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsHeaders = (origin: string | null) => ({
  ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (body: Record<string, unknown>, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

const validSlug = (value: string) => /^[a-z0-9][a-z0-9-]{2,62}$/.test(value);

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.includes(origin)) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Authentication is required.' }, 401, origin);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !serviceRoleKey || !anonKey) return json({ error: 'Function is not configured.' }, 500, origin);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: 'Invalid session.' }, 401, origin);

  const adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== 'super_admin') return json({ error: 'Access denied.' }, 403, origin);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400, origin);
  }

  const tenantName = String(payload.tenant_name ?? '').trim();
  const slug = String(payload.slug ?? '').trim().toLowerCase();
  const city = String(payload.city ?? '').trim();
  const phone = String(payload.phone ?? '').trim();
  const address = String(payload.address ?? '').trim();
  const status = String(payload.status ?? 'active');
  const userName = String(payload.user_name ?? '').trim();
  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');

  if (!tenantName || tenantName.length > 120) return json({ error: 'Informe um nome de estabelecimento entre 1 e 120 caracteres.' }, 400, origin);
  if (!validSlug(slug)) return json({ error: 'O slug deve ter 3 a 63 caracteres minúsculos, números ou hífens.' }, 400, origin);
  if (!city || city.length > 100) return json({ error: 'Informe a cidade do estabelecimento.' }, 400, origin);
  if (!userName || userName.length > 120) return json({ error: 'Informe o nome do usuário responsável.' }, 400, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400, origin);
  if (password.length < 12) return json({ error: 'A senha inicial deve ter pelo menos 12 caracteres.' }, 400, origin);
  if (!['active', 'inactive', 'suspended'].includes(status)) return json({ error: 'Selecione um status válido.' }, 400, origin);

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: userName },
  });
  if (createUserError || !createdUser.user) return json({ error: createUserError?.message ?? 'Unable to create user.' }, 400, origin);

  const { data: tenant, error: provisionError } = await adminClient.rpc('provision_client_tenant', {
    requested_user_id: createdUser.user.id,
    requested_name: tenantName,
    requested_slug: slug,
    requested_city: city,
    requested_phone: phone,
    requested_address: address,
    requested_status: status,
  });

  if (provisionError) {
    await adminClient.auth.admin.deleteUser(createdUser.user.id);
    return json({ error: 'Unable to provision client. No user was retained.' }, 400, origin);
  }

  return json({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.public_slug } }, 201, origin);
});
