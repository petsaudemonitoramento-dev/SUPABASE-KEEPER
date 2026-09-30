-- Execute uma vez em cada projeto Supabase que será mantido ativo.
-- A função não lê nem altera dados: ela apenas executa SELECT TRUE.

create or replace function public.keeper_ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keeper_ping() from public;
grant execute on function public.keeper_ping() to anon, authenticated;
