begin;

-- PostgreSQL row IS NOT NULL requires every attribute to be non-null. Chat
-- rows legitimately have nullable reply/card/deletion fields; detect the
-- primary key instead so retries return the existing authorized DTO.
-- Patch only this guard, preserving the installed activity/MFA/block checks.
do $migration$
declare
  definition text := pg_get_functiondef('public.send_my_marketplace_chat_message(uuid,uuid,text,text,uuid,jsonb)'::regprocedure);
begin
  if strpos(definition, 'if v_message is not null then') = 0 then
    raise exception 'expected_chat_idempotency_guard_missing';
  end if;
  execute replace(definition, 'if v_message is not null then', 'if v_message.id is not null then');
end;
$migration$;

commit;
