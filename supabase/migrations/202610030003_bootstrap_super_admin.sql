-- Bootstrap the first platform administrator after creating the Auth account.
insert into public.profiles (id, display_name, role)
values ('914bddb3-3108-4f1a-be3e-5e0ed6ec503b', 'Fabricius', 'super_admin')
on conflict (id) do update
set role = excluded.role,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);
