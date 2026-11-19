-- Small consistent metadata reads; image chunks are fetched separately under the same RLS.
create or replace function public.rentpro_read_meta() returns jsonb language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); project_id uuid; rev bigint; rows jsonb; membership public.rentpro_memberships%rowtype;
begin
 if who is null then raise exception 'AUTH_REQUIRED'; end if;
 project_id:=public.rentpro_project_owner();
 select * into membership from public.rentpro_memberships where user_id=who;
 select revision into rev from public.rentpro_state where owner_id=project_id for share;
 if not found then rev:=0; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'value',value) order by record_id),'[]'::jsonb) into rows from public.rentpro_records where owner_id=project_id and coalesce(value->>'kind','')<>'asset';
 return jsonb_build_object('owner_id',who,'project_owner_id',project_id,'project_name',membership.project_name,'member_role',membership.member_role,'shared',membership.user_id is not null,'revision',rev,'records',rows);
end $$;
revoke all on function public.rentpro_read_meta() from public,anon;
grant execute on function public.rentpro_read_meta() to authenticated;
-- Keep earlier open versions working while they upgrade: aggregate JSON once rather than
-- repeatedly building a growing JSONB value containing every image part.
create or replace function public.rentpro_read() returns jsonb language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); project_id uuid; rev bigint; rows json; membership public.rentpro_memberships%rowtype;
begin
 if who is null then raise exception 'AUTH_REQUIRED'; end if;
 project_id:=public.rentpro_project_owner();
 select * into membership from public.rentpro_memberships where user_id=who;
 select revision into rev from public.rentpro_state where owner_id=project_id for share;
 if not found then rev:=0; end if;
 select coalesce(json_agg(json_build_object('id',record_id,'value',value) order by record_id),'[]'::json) into rows from public.rentpro_records where owner_id=project_id;
 return json_build_object('owner_id',who,'project_owner_id',project_id,'project_name',membership.project_name,'member_role',membership.member_role,'shared',membership.user_id is not null,'revision',rev,'records',rows)::jsonb;
end $$;
revoke all on function public.rentpro_read() from public,anon;
grant execute on function public.rentpro_read() to authenticated;
