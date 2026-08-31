begin;

-- Remove the legacy permissive policies that made the narrower parent
-- cancellation policy ineffective. Admin access remains available through
-- applications_admin_all; parents may only cancel their own active request.
drop policy if exists "applications_update_own_or_admin"
on public.applications;

drop policy if exists "applications_select_own_or_admin"
on public.applications;

revoke update on table public.applications from authenticated;
grant update (status, updated_at)
on table public.applications
to authenticated;

drop policy if exists "applications_parent_cancel"
on public.applications;

create policy "applications_parent_cancel"
on public.applications
for update
to authenticated
using (
  parent_id = (select auth.uid())
  and status in (
    'applied'::public.application_status,
    'waiting'::public.application_status,
    'confirmed'::public.application_status
  )
)
with check (
  parent_id = (select auth.uid())
  and status = 'canceled'::public.application_status
);

-- Keep the public helper limited to open, upcoming classes while counting the
-- actual enum values stored by the application workflow.
create or replace function public.get_active_application_count(p_class_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $function$
  select case
    when exists (
      select 1
      from public.classes as c
      where c.id = p_class_id
        and c.is_open = true
        and c.starts_at >= now()
    )
    then (
      select count(*)::integer
      from public.applications as a
      where a.class_id = p_class_id
        and a.status in (
          'applied'::public.application_status,
          'waiting'::public.application_status,
          'confirmed'::public.application_status
        )
    )
    else 0
  end;
$function$;

revoke all privileges
on function public.get_active_application_count(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_active_application_count(uuid)
to anon, authenticated, service_role;

-- The product is intentionally limited to children aged 8 through 13. Keep
-- the server constraint aligned with the mobile validation.
alter table public.children
drop constraint if exists children_age_check;

alter table public.children
add constraint children_age_check check (age between 8 and 13);

-- Append-only evidence of the guardian's current legal-document acceptance.
-- A verified phone session is checked server-side before a record is written.
create table if not exists public.guardian_consent_records (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  guardian_name_snapshot text not null,
  guardian_relationship text not null
    check (guardian_relationship in ('father', 'mother', 'other_legal_guardian')),
  privacy_policy_version text not null,
  terms_version text not null,
  privacy_collection_agreed boolean not null default true
    check (privacy_collection_agreed = true),
  child_data_agreed boolean not null default true
    check (child_data_agreed = true),
  legal_guardian_confirmed boolean not null default true
    check (legal_guardian_confirmed = true),
  overseas_transfer_acknowledged boolean not null default true
    check (overseas_transfer_acknowledged = true),
  activity_photo_agreed boolean not null default false,
  verification_method text not null default 'verified_phone_session'
    check (verification_method = 'verified_phone_session'),
  phone_verified_at timestamptz not null,
  source text not null
    check (source in ('signup', 'existing_user', 'settings')),
  created_at timestamptz not null default now(),
  check (char_length(btrim(guardian_name_snapshot)) between 2 and 50),
  check (char_length(btrim(privacy_policy_version)) between 1 and 32),
  check (char_length(btrim(terms_version)) between 1 and 32)
);

create index if not exists guardian_consent_records_parent_created_idx
on public.guardian_consent_records (parent_id, created_at desc);

alter table public.guardian_consent_records enable row level security;

revoke all privileges
on table public.guardian_consent_records
from public, anon, authenticated;

grant select
on table public.guardian_consent_records
to authenticated;

drop policy if exists "guardian_consent_records_parent_select"
on public.guardian_consent_records;

create policy "guardian_consent_records_parent_select"
on public.guardian_consent_records
for select
to authenticated
using (parent_id = (select auth.uid()));

drop policy if exists "guardian_consent_records_admin_select"
on public.guardian_consent_records;

create policy "guardian_consent_records_admin_select"
on public.guardian_consent_records
for select
to authenticated
using (public.is_admin());

create or replace function public.record_guardian_consent(
  p_guardian_name text,
  p_guardian_relationship text,
  p_privacy_policy_version text,
  p_terms_version text,
  p_activity_photo_agreed boolean,
  p_source text default 'existing_user'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  verified_at timestamptz;
  consent_record_id uuid;
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  if char_length(btrim(coalesce(p_privacy_policy_version, ''))) not between 1 and 32
    or char_length(btrim(coalesce(p_terms_version, ''))) not between 1 and 32 then
    raise exception '동의 문서 버전을 확인해 주세요.';
  end if;

  if char_length(btrim(coalesce(p_guardian_name, ''))) not between 2 and 50 then
    raise exception '보호자 이름을 확인해 주세요.';
  end if;

  if p_guardian_relationship not in ('father', 'mother', 'other_legal_guardian') then
    raise exception '법정대리인 관계를 확인해 주세요.';
  end if;

  if p_source not in ('signup', 'existing_user', 'settings') then
    raise exception '지원하지 않는 동의 경로예요.';
  end if;

  select u.phone_confirmed_at
  into verified_at
  from auth.users as u
  where u.id = current_user_id;

  if verified_at is null then
    raise exception '인증된 보호자 전화번호가 필요해요.';
  end if;

  if not exists (
    select 1
    from public.profiles as p
    where p.id = current_user_id
      and p.role = 'parent'::public.user_role
  ) then
    raise exception '보호자 계정을 확인할 수 없어요.';
  end if;

  insert into public.guardian_consent_records (
    parent_id,
    guardian_name_snapshot,
    guardian_relationship,
    privacy_policy_version,
    terms_version,
    privacy_collection_agreed,
    child_data_agreed,
    legal_guardian_confirmed,
    overseas_transfer_acknowledged,
    activity_photo_agreed,
    verification_method,
    phone_verified_at,
    source
  )
  values (
    current_user_id,
    btrim(p_guardian_name),
    p_guardian_relationship,
    btrim(p_privacy_policy_version),
    btrim(p_terms_version),
    true,
    true,
    true,
    true,
    p_activity_photo_agreed,
    'verified_phone_session',
    verified_at,
    p_source
  )
  returning id into consent_record_id;

  update public.profiles
  set full_name = btrim(p_guardian_name),
      updated_at = now()
  where id = current_user_id;

  return consent_record_id;
end;
$function$;

revoke all privileges
on function public.record_guardian_consent(text, text, text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function public.record_guardian_consent(text, text, text, text, boolean, text)
to authenticated;

-- Activity photos are optional. A parent can only read them, and an admin can
-- only create their metadata, while the latest consent for the current legal
-- document versions is affirmative.
drop policy if exists "completed_class_photos_parent_select"
on public.completed_class_photos;

create policy "completed_class_photos_parent_select"
on public.completed_class_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.completed_classes as cc
    join public.applications as a on a.id = cc.application_id
    where cc.id = completed_class_photos.completed_class_id
      and a.parent_id = (select auth.uid())
      and coalesce(
        (
          select consent.activity_photo_agreed
          from public.guardian_consent_records as consent
          where consent.parent_id = a.parent_id
            and consent.privacy_policy_version = '2026-08-05'
            and consent.terms_version = '2026-08-05'
          order by consent.created_at desc, consent.id desc
          limit 1
        ),
        false
      ) = true
  )
);

drop policy if exists "completed_class_photos_photo_consent_insert"
on public.completed_class_photos;

create policy "completed_class_photos_photo_consent_insert"
on public.completed_class_photos
as restrictive
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.completed_classes as cc
    join public.applications as a on a.id = cc.application_id
    where cc.id = completed_class_photos.completed_class_id
      and coalesce(
        (
          select consent.activity_photo_agreed
          from public.guardian_consent_records as consent
          where consent.parent_id = a.parent_id
            and consent.privacy_policy_version = '2026-08-05'
            and consent.terms_version = '2026-08-05'
          order by consent.created_at desc, consent.id desc
          limit 1
        ),
        false
      ) = true
  )
);

commit;
