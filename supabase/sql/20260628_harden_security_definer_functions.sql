begin;

-- SECURITY DEFINER implementations do not belong in the exposed public API
-- schema. Keep their public RPC names as SECURITY INVOKER gateways so existing
-- mobile/admin clients remain compatible while PostgREST cannot expose the
-- privileged implementations directly.
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function private.apply_to_class(
  p_child_id uuid,
  p_class_id uuid
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  class_record public.classes%rowtype;
  active_count integer;
  new_application public.applications%rowtype;
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  if not exists (
    select 1
    from public.children c
    where c.id = p_child_id
      and c.parent_id = current_user_id
  ) then
    raise exception '등록된 아이 정보를 확인할 수 없어요.';
  end if;

  select *
  into class_record
  from public.classes c
  where c.id = p_class_id
  for update;

  if not found or class_record.is_open is not true then
    raise exception '신청할 수 없는 수업이에요.';
  end if;

  if class_record.starts_at < now() then
    raise exception '이미 지난 수업이에요.';
  end if;

  if exists (
    select 1
    from public.applications a
    where a.child_id = p_child_id
      and a.class_id = p_class_id
      and a.status::text in ('applied', 'waiting', 'confirmed')
  ) then
    raise exception '이미 신청한 수업이에요.';
  end if;

  select count(*)::integer
  into active_count
  from public.applications a
  where a.class_id = p_class_id
    and a.status::text in ('applied', 'waiting', 'confirmed');

  if active_count >= class_record.seats_total then
    raise exception '마감된 수업이에요.';
  end if;

  insert into public.applications (
    parent_id,
    child_id,
    class_id,
    status
  )
  values (
    current_user_id,
    p_child_id,
    p_class_id,
    'applied'
  )
  returning * into new_application;

  return new_application;
end;
$$;

create or replace function private.admin_confirm_application(
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception '운영진 계정만 신청을 승인할 수 있어요.';
  end if;

  update public.applications
  set status = 'confirmed',
      updated_at = now()
  where id = p_application_id
    and status::text = 'applied';

  if not found then
    raise exception '확인 중인 신청을 찾을 수 없어요.';
  end if;
end;
$$;

create or replace function private.admin_cancel_pending_application(
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_class_id uuid;
begin
  if not private.is_admin() then
    raise exception '운영진 계정만 신청을 취소할 수 있어요.';
  end if;

  update public.applications
  set status = 'canceled',
      updated_at = now()
  where id = p_application_id
    and status::text = 'applied'
  returning class_id into target_class_id;

  if not found then
    raise exception '확인 중인 신청을 찾을 수 없어요.';
  end if;

  update public.classes c
  set is_open = false,
      updated_at = now()
  where c.id = target_class_id
    and c.starts_at <= now()
    and not exists (
      select 1
      from public.applications a
      where a.class_id = c.id
        and a.status::text in ('applied', 'waiting', 'confirmed')
    );
end;
$$;

create or replace function private.admin_cancel_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception '운영진 계정만 수업을 취소할 수 있어요.';
  end if;

  update public.applications
  set status = 'canceled',
      updated_at = now()
  where class_id = p_class_id
    and status::text in ('applied', 'waiting', 'confirmed');

  update public.classes
  set is_open = false,
      updated_at = now()
  where id = p_class_id;

  if not found then
    raise exception '수업을 찾을 수 없어요.';
  end if;
end;
$$;

create or replace function private.admin_delete_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_class_id uuid;
begin
  if not private.is_admin() then
    raise exception '운영진 계정만 수업을 삭제할 수 있어요.';
  end if;

  select id
  into target_class_id
  from public.classes
  where id = p_class_id
  for update;

  if target_class_id is null then
    raise exception '수업을 찾을 수 없어요.';
  end if;

  delete from public.completed_class_photos p
  using public.completed_classes cc, public.applications a
  where p.completed_class_id = cc.id
    and cc.application_id = a.id
    and a.class_id = p_class_id;

  delete from public.completed_classes cc
  using public.applications a
  where cc.application_id = a.id
    and a.class_id = p_class_id;

  delete from public.applications
  where class_id = p_class_id;

  delete from public.classes
  where id = p_class_id;
end;
$$;

create or replace function private.get_active_application_count(
  p_class_id uuid
)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.applications a
  where a.class_id = p_class_id
    and a.status::text in ('applied', 'waiting', 'confirmed');
$$;

revoke all privileges on all functions in schema private
  from public, anon, authenticated, service_role;

grant execute on function private.is_admin()
  to authenticated, service_role;
grant execute on function private.apply_to_class(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.admin_confirm_application(uuid)
  to authenticated, service_role;
grant execute on function private.admin_cancel_pending_application(uuid)
  to authenticated, service_role;
grant execute on function private.admin_cancel_class(uuid)
  to authenticated, service_role;
grant execute on function private.admin_delete_class(uuid)
  to authenticated, service_role;
grant execute on function private.get_active_application_count(uuid)
  to authenticated, service_role;

-- Public functions are unprivileged compatibility gateways. Their names and
-- signatures stay unchanged, so existing app and admin-web RPC calls continue
-- to work without exposing a SECURITY DEFINER function through PostgREST.
create or replace function public.is_admin()
returns boolean
language sql
security invoker
set search_path = ''
stable
as $$
  select private.is_admin();
$$;

create or replace function public.apply_to_class(
  p_child_id uuid,
  p_class_id uuid
)
returns public.applications
language sql
security invoker
set search_path = ''
as $$
  select application.*
  from private.apply_to_class(p_child_id, p_class_id) as application;
$$;

create or replace function public.admin_confirm_application(
  p_application_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_confirm_application(p_application_id);
$$;

create or replace function public.admin_cancel_pending_application(
  p_application_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_cancel_pending_application(p_application_id);
$$;

create or replace function public.admin_cancel_class(p_class_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_cancel_class(p_class_id);
$$;

create or replace function public.admin_delete_class(p_class_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_delete_class(p_class_id);
$$;

create or replace function public.get_active_application_count(
  p_class_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
stable
as $$
  select private.get_active_application_count(p_class_id);
$$;

revoke all privileges on function public.is_admin()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.apply_to_class(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_confirm_application(uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_cancel_pending_application(uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_cancel_class(uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_delete_class(uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.get_active_application_count(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_admin()
  to authenticated, service_role;
grant execute on function public.apply_to_class(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.admin_confirm_application(uuid)
  to authenticated, service_role;
grant execute on function public.admin_cancel_pending_application(uuid)
  to authenticated, service_role;
grant execute on function public.admin_cancel_class(uuid)
  to authenticated, service_role;
grant execute on function public.admin_delete_class(uuid)
  to authenticated, service_role;
grant execute on function public.get_active_application_count(uuid)
  to authenticated, service_role;

-- These functions are trigger/internal helpers and must never be callable as
-- public RPCs. Keep the Auth trigger available only to Supabase Auth.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user()
  to supabase_auth_admin;

revoke execute on function public.handle_new_auth_user_profile()
  from public, anon, authenticated, service_role;
grant execute on function public.handle_new_auth_user_profile()
  to supabase_auth_admin;

revoke execute on function public.mark_application_completed()
  from public, anon, authenticated, service_role;
revoke execute on function public.mark_application_completed_from_completion()
  from public, anon, authenticated, service_role;
revoke execute on function public.has_pending_review_applications_for_class(uuid, uuid)
  from public, anon, authenticated, service_role;

-- is_phone_registered remains temporarily available for already-installed app
-- builds. Remove it only after the mobile release that no longer calls this RPC
-- has reached production users.

commit;
