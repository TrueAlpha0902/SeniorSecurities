-- Hotfix: allow activation-code generation to find pgcrypto functions in Supabase.
-- Paste this whole file into Supabase SQL Editor and click Run.

create extension if not exists pgcrypto;

create or replace function public.activation_code_hash(input_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(public.normalize_activation_code(input_code), 'sha256'), 'hex');
$$;

create or replace function public.create_activation_code(
  p_code text default null,
  p_note text default null,
  p_max_uses integer default 1
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  generated_code text;
  normalized_code text;
begin
  if coalesce(p_max_uses, 0) < 1 then
    raise exception 'max_uses must be at least 1';
  end if;

  generated_code := coalesce(nullif(trim(p_code), ''), 'SENIOR' || encode(gen_random_bytes(8), 'hex'));
  normalized_code := public.normalize_activation_code(generated_code);

  if length(normalized_code) < 10 then
    raise exception '啟用碼至少需要 10 個英數字元。';
  end if;

  insert into public.activation_codes (code_hash, code_preview, max_uses, note)
  values (
    public.activation_code_hash(normalized_code),
    public.mask_activation_code(normalized_code),
    p_max_uses,
    p_note
  );

  return public.format_activation_code(normalized_code);
end;
$$;

revoke all on function public.create_activation_code(text, text, integer) from public;
grant execute on function public.create_activation_code(text, text, integer) to service_role;
