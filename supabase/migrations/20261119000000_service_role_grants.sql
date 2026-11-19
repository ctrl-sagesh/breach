-- Explicit grants for the service role the account and submit-run Edge Functions use.
-- service_role normally gets full access to every table by default on a Supabase project, so earlier
-- migrations never granted it anything directly. That default turned out to be missing on this project:
-- a live register call failed with "permission denied for table players" (42501) for service_role.
-- These grants are safe to re-run and make the dependency explicit instead of relying on a platform default.

grant usage on schema public to service_role;
grant select, insert, update, delete on public.players, public.runs, public.rate_limits, public.auth_attempts to service_role;
grant select on public.campaign_totals to service_role;
grant execute on function public.player_rank(uuid, text) to service_role;
grant usage, select on all sequences in schema public to service_role;

-- So a table or sequence created later is covered too, without another migration like this one.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
