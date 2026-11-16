-- RentPro account directory. The directory contains account metadata only.
create schema rentpro_private;
revoke all on schema rentpro_private from public, anon;
grant usage on schema rentpro_private to authenticated;

create table rentpro_private.admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table rentpro_private.usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
alter table rentpro_private.admins enable row level security;
alter table rentpro_private.usage enable row level security;
revoke all on rentpro_private.admins, rentpro_private.usage from public, anon, authenticated;
-- Bootstrap the first admin separately using the owner-selected, verified account.
-- No frontend or self-service API can grant this role.

create function rentpro_private.visit() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 insert into rentpro_private.usage(user_id) values(who)
 on conflict(user_id) do update set last_seen_at=now()
 where rentpro_private.usage.last_seen_at < now()-interval '60 seconds';
 return jsonb_build_object('is_admin',exists(select 1 from rentpro_private.admins where user_id=who),'server_time',now());
end $$;

create function rentpro_private.list_users() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); rows jsonb; total bigint;
begin
 if who is null or not exists(select 1 from rentpro_private.admins where user_id=who) then
  raise exception 'RENTPRO_ADMIN_REQUIRED' using errcode='42501';
 end if;
 -- The app marker identifies signups only; it never grants admin permission.
 select count(*) into total from auth.users u
 where exists(select 1 from public.rentpro_state s where s.owner_id=u.id)
 or exists(select 1 from rentpro_private.usage a where a.user_id=u.id)
 or exists(select 1 from rentpro_private.admins a where a.user_id=u.id)
 or u.raw_user_meta_data->>'application'='rentpro';
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (
  select u.id,u.email,u.created_at,u.email_confirmed_at,
    a.first_seen_at,a.last_seen_at,s.updated_at as last_data_update,
    exists(select 1 from rentpro_private.admins x where x.user_id=u.id) as is_admin
  from auth.users u left join public.rentpro_state s on s.owner_id=u.id
  left join rentpro_private.usage a on a.user_id=u.id
  where s.owner_id is not null or a.user_id is not null
    or exists(select 1 from rentpro_private.admins x where x.user_id=u.id)
    or u.raw_user_meta_data->>'application'='rentpro'
  order by a.last_seen_at desc nulls last,u.created_at desc,u.id limit 200
 ) q;
 return jsonb_build_object('users',rows,'total',total,'server_time',now());
end $$;
revoke all on function rentpro_private.visit(),rentpro_private.list_users() from public,anon;
grant execute on function rentpro_private.visit(),rentpro_private.list_users() to authenticated;
create function public.rentpro_visit() returns jsonb language sql security invoker set search_path='' as $$ select rentpro_private.visit(); $$;
create function public.rentpro_users() returns jsonb language sql security invoker set search_path='' as $$ select rentpro_private.list_users(); $$;
revoke all on function public.rentpro_visit(),public.rentpro_users() from public,anon;
grant execute on function public.rentpro_visit(),public.rentpro_users() to authenticated;

create policy rentpro_admins_no_direct_access on rentpro_private.admins for all to authenticated using (false) with check (false);
create policy rentpro_usage_no_direct_access on rentpro_private.usage for all to authenticated using (false) with check (false);
