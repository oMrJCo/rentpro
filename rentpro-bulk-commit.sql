-- Preserve the shared-project actor and revision checks; write a batch in one SQL operation.
-- New clients send image chunks in small batches before publishing document references.
create or replace function public.rentpro_commit(expected_owner uuid,expected_revision bigint,changes jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); project_id uuid; rev bigint;
begin
 if who is null or who is distinct from expected_owner then raise exception 'AUTH_ACCOUNT_CHANGED'; end if;
 if changes is null or jsonb_typeof(changes)<>'array' then raise exception 'INVALID_CHANGES'; end if;
 if exists(select 1 from jsonb_array_elements(changes) item where nullif(item->>'id','') is null or item->'value' is null or jsonb_typeof(item->'value')<>'object') then raise exception 'INVALID_RECORD'; end if;
 project_id:=public.rentpro_project_owner();
 insert into public.rentpro_state(owner_id) values(project_id) on conflict do nothing;
 select revision into rev from public.rentpro_state where owner_id=project_id for update;
 if rev<>expected_revision or expected_revision is null then raise exception 'CLOUD_REVISION_CHANGED'; end if;
 insert into public.rentpro_records(owner_id,record_id,value)
 select project_id, selected.id, selected.value from
 (select distinct on (item->>'id') item->>'id' as id,item->'value' as value from jsonb_array_elements(changes) with ordinality as rows(item,position) order by item->>'id',position desc) selected
 on conflict(owner_id,record_id) do update set value=excluded.value;
 update public.rentpro_state set revision=rev+1,updated_at=now() where owner_id=project_id;
 return rev+1;
end $$;
revoke all on function public.rentpro_commit(uuid,bigint,jsonb) from public,anon;
grant execute on function public.rentpro_commit(uuid,bigint,jsonb) to authenticated;
