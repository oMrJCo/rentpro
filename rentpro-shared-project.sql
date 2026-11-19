-- Apply after rentpro-cloud-schema.sql. Membership is provisioned by the project
-- administrator; app users cannot grant themselves membership or change owners.
create table if not exists public.rentpro_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 project_owner_id uuid not null references auth.users(id) on delete restrict,
 member_role text not null check(member_role in ('owner','editor')),
 project_name text not null default 'โครงการโกดังร่วม',
 created_at timestamptz not null default now()
);
alter table public.rentpro_memberships enable row level security;
revoke all on public.rentpro_memberships from public,anon,authenticated;
grant select on public.rentpro_memberships to authenticated;
create policy rentpro_membership_self on public.rentpro_memberships for select to authenticated
 using(user_id=(select auth.uid()));
create or replace function public.rentpro_project_owner() returns uuid
 language sql stable security invoker set search_path='' as $$
 select coalesce((select m.project_owner_id from public.rentpro_memberships m where m.user_id=(select auth.uid())),(select auth.uid()));
$$;
revoke all on function public.rentpro_project_owner() from public,anon;
grant execute on function public.rentpro_project_owner() to authenticated;
drop policy rentpro_state_owner on public.rentpro_state;
drop policy rentpro_records_owner on public.rentpro_records;
create policy rentpro_state_project on public.rentpro_state for all to authenticated
 using(owner_id=(select public.rentpro_project_owner())) with check(owner_id=(select public.rentpro_project_owner()));
create policy rentpro_records_project on public.rentpro_records for all to authenticated
 using(owner_id=(select public.rentpro_project_owner())) with check(owner_id=(select public.rentpro_project_owner()));
create or replace function public.rentpro_read() returns jsonb language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); project_id uuid; rev bigint; rows jsonb; membership public.rentpro_memberships%rowtype;
begin
 if who is null then raise exception 'AUTH_REQUIRED'; end if;
 project_id:=public.rentpro_project_owner();
 select * into membership from public.rentpro_memberships where user_id=who;
 select revision into rev from public.rentpro_state where owner_id=project_id for share;
 if not found then rev:=0; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'value',value) order by record_id),'[]'::jsonb) into rows from public.rentpro_records where owner_id=project_id;
 -- owner_id remains the signed-in actor for old-client account-switch guards.
 return jsonb_build_object('owner_id',who,'project_owner_id',project_id,'project_name',membership.project_name,'member_role',membership.member_role,'shared',membership.user_id is not null,'revision',rev,'records',rows);
end $$;
create or replace function public.rentpro_commit(expected_owner uuid,expected_revision bigint,changes jsonb) returns bigint language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); project_id uuid; rev bigint; item jsonb;
begin
 if who is null or who is distinct from expected_owner then raise exception 'AUTH_ACCOUNT_CHANGED'; end if;
 if changes is null or jsonb_typeof(changes)<>'array' then raise exception 'INVALID_CHANGES'; end if;
 project_id:=public.rentpro_project_owner();
 insert into public.rentpro_state(owner_id) values(project_id) on conflict do nothing;
 select revision into rev from public.rentpro_state where owner_id=project_id for update;
 if rev<>expected_revision or expected_revision is null then raise exception 'CLOUD_REVISION_CHANGED'; end if;
 for item in select * from jsonb_array_elements(changes) loop
  if nullif(item->>'id','') is null or item->'value' is null or jsonb_typeof(item->'value')<>'object' then raise exception 'INVALID_RECORD'; end if;
  insert into public.rentpro_records(owner_id,record_id,value) values(project_id,item->>'id',item->'value') on conflict(owner_id,record_id) do update set value=excluded.value;
 end loop;
 update public.rentpro_state set revision=rev+1,updated_at=now() where owner_id=project_id;
 return rev+1;
end $$;
revoke all on function public.rentpro_read(),public.rentpro_commit(uuid,bigint,jsonb) from public,anon;
grant execute on function public.rentpro_read(),public.rentpro_commit(uuid,bigint,jsonb) to authenticated;
