create table public.rentpro_state (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now()
);
create table public.rentpro_records (
 owner_id uuid not null references public.rentpro_state(owner_id) on delete cascade,
 record_id text not null,
 value jsonb not null,
 primary key(owner_id,record_id)
);
alter table public.rentpro_state enable row level security;
alter table public.rentpro_records enable row level security;
create policy rentpro_state_owner on public.rentpro_state for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy rentpro_records_owner on public.rentpro_records for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.rentpro_state,public.rentpro_records from anon;
grant select,insert,update on public.rentpro_state,public.rentpro_records to authenticated;
create function public.rentpro_read() returns jsonb language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); rev bigint; rows jsonb;
begin
 if who is null then raise exception 'AUTH_REQUIRED'; end if;
 select revision into rev from public.rentpro_state where owner_id=who for share;
 if not found then return jsonb_build_object('owner_id',who,'revision',0,'records','[]'::jsonb); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'value',value)),'[]'::jsonb) into rows from public.rentpro_records where owner_id=who;
 return jsonb_build_object('owner_id',who,'revision',rev,'records',rows);
end $$;
create function public.rentpro_commit(expected_owner uuid,expected_revision bigint,changes jsonb) returns bigint language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); rev bigint; item jsonb;
begin
 if who is null or who is distinct from expected_owner then raise exception 'AUTH_ACCOUNT_CHANGED'; end if;
 if jsonb_typeof(changes)<>'array' then raise exception 'INVALID_CHANGES'; end if;
 insert into public.rentpro_state(owner_id) values(who) on conflict do nothing;
 select revision into rev from public.rentpro_state where owner_id=who for update;
 if rev<>expected_revision then raise exception 'CLOUD_REVISION_CHANGED'; end if;
 for item in select * from jsonb_array_elements(changes) loop
  if nullif(item->>'id','') is null or jsonb_typeof(item->'value')<>'object' then raise exception 'INVALID_RECORD'; end if;
  insert into public.rentpro_records(owner_id,record_id,value) values(who,item->>'id',item->'value') on conflict(owner_id,record_id) do update set value=excluded.value;
 end loop;
 update public.rentpro_state set revision=rev+1,updated_at=now() where owner_id=who;
 return rev+1;
end $$;
revoke all on function public.rentpro_read(),public.rentpro_commit(uuid,bigint,jsonb) from public,anon;
grant execute on function public.rentpro_read(),public.rentpro_commit(uuid,bigint,jsonb) to authenticated;
