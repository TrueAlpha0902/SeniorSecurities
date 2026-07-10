-- SeniorSecurities v63
-- The web admin tools call this RPC only from a Vercel Function using service_role.
-- Run once in Supabase SQL Editor if v42 was previously applied.

alter function public.create_activation_code(text, text, integer) set search_path = public, extensions;
revoke all on function public.create_activation_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.create_activation_code(text, text, integer) to service_role;

select pg_notify('pgrst', 'reload schema');
