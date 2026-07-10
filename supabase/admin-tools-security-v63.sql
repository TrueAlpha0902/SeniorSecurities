-- SeniorSecurities v63
-- Keep the legacy RPC available only to trusted server-side service_role callers.
-- The current web admin activation-code flow inserts through a Vercel Function and does not expose this RPC to clients.
-- Run once in Supabase SQL Editor if v42 was previously applied.

alter function public.create_activation_code(text, text, integer) set search_path = public, extensions;
revoke all on function public.create_activation_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.create_activation_code(text, text, integer) to service_role;

select pg_notify('pgrst', 'reload schema');
