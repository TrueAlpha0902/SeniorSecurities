-- Cover foreign-key columns used by joins and parent-row updates/deletes.
-- These indexes are intentionally narrow to keep write overhead low.

create index if not exists activation_codes_redeemed_by_idx
  on public.activation_codes (redeemed_by);

create index if not exists admin_audit_events_actor_user_id_idx
  on public.admin_audit_events (actor_user_id);

create index if not exists user_entitlements_source_code_hash_idx
  on public.user_entitlements (source_code_hash);
