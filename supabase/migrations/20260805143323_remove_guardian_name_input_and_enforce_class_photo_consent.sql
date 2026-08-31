begin;

-- A typed guardian name is not used for identity verification. Keep only the
-- verified phone session, guardian relationship, document versions and server
-- timestamp as the consent evidence.
create or replace function private.record_guardian_consent(
  p_guardian_relationship text,
  p_privacy_policy_version text,
  p_terms_version text,
  p_activity_photo_agreed boolean,
  p_source text
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
    p_guardian_relationship,
    btrim(p_privacy_policy_version),
    btrim(p_terms_version),
    true,
    true,
    true,
    true,
    coalesce(p_activity_photo_agreed, false),
    'verified_phone_session',
    verified_at,
    p_source
  )
  returning id into consent_record_id;

  return consent_record_id;
end;
$function$;

revoke all privileges
on function private.record_guardian_consent(text, text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function private.record_guardian_consent(text, text, text, boolean, text)
to authenticated;

-- Keep the previous public signature temporarily compatible with an already
-- open client, but ignore the obsolete name argument and never store it.
create or replace function public.record_guardian_consent(
  p_guardian_name text,
  p_guardian_relationship text,
  p_privacy_policy_version text,
  p_terms_version text,
  p_activity_photo_agreed boolean,
  p_source text default 'existing_user'
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_guardian_consent(
    p_guardian_relationship,
    p_privacy_policy_version,
    p_terms_version,
    p_activity_photo_agreed,
    p_source
  );
$function$;

revoke all privileges
on function public.record_guardian_consent(text, text, text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function public.record_guardian_consent(text, text, text, text, boolean, text)
to authenticated;

drop function if exists private.record_guardian_consent(
  text,
  text,
  text,
  text,
  boolean,
  text
);

create or replace function public.record_guardian_consent(
  p_guardian_relationship text,
  p_privacy_policy_version text,
  p_terms_version text,
  p_activity_photo_agreed boolean,
  p_source text default 'existing_user'
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_guardian_consent(
    p_guardian_relationship,
    p_privacy_policy_version,
    p_terms_version,
    p_activity_photo_agreed,
    p_source
  );
$function$;

revoke all privileges
on function public.record_guardian_consent(text, text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function public.record_guardian_consent(text, text, text, boolean, text)
to authenticated;

-- Stop requiring or writing a guardian name for new consent records. Keep the
-- historical snapshot column nullable so this rollout does not irreversibly
-- destroy existing consent evidence.
alter table public.guardian_consent_records
alter column guardian_name_snapshot drop not null;

create index if not exists guardian_consent_records_current_lookup_idx
on public.guardian_consent_records (
  parent_id,
  privacy_policy_version,
  terms_version,
  created_at desc,
  id desc
);

create index if not exists applications_class_id_status_parent_idx
on public.applications (class_id, status, parent_id);

-- Photos from a group activity are only safe to upload when every actual
-- participant has a current affirmative photo consent. A single missing or
-- withdrawn consent blocks the whole class photo set.
create or replace function private.class_has_current_photo_consent(
  p_class_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select
    exists (
      select 1
      from public.applications as participant
      where participant.class_id = p_class_id
        and participant.status in (
          'confirmed'::public.application_status,
          'completed'::public.application_status
        )
    )
    and not exists (
      select 1
      from public.applications as participant
      where participant.class_id = p_class_id
        and participant.status in (
          'confirmed'::public.application_status,
          'completed'::public.application_status
        )
        and coalesce(
          (
            select consent.activity_photo_agreed
            from public.guardian_consent_records as consent
            where consent.parent_id = participant.parent_id
              and consent.privacy_policy_version = '2026-08-05'
              and consent.terms_version = '2026-08-05'
            order by consent.created_at desc, consent.id desc
            limit 1
          ),
          false
        ) = false
    );
$function$;

revoke all privileges
on function private.class_has_current_photo_consent(uuid)
from public, anon, authenticated, service_role;

grant execute
on function private.class_has_current_photo_consent(uuid)
to authenticated;

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
      and (select private.class_has_current_photo_consent(a.class_id))
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
  (select public.is_admin())
  and exists (
    select 1
    from public.completed_classes as cc
    join public.applications as a on a.id = cc.application_id
    where cc.id = completed_class_photos.completed_class_id
      and a.status in (
        'confirmed'::public.application_status,
        'completed'::public.application_status
      )
      and (select private.class_has_current_photo_consent(a.class_id))
  )
);

drop policy if exists "completed_class_photos_storage_parent_select"
on storage.objects;

create policy "completed_class_photos_storage_parent_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'completed-class-photos'
  and exists (
    select 1
    from public.completed_class_photos as photo
    join public.completed_classes as cc on cc.id = photo.completed_class_id
    join public.applications as a on a.id = cc.application_id
    where photo.storage_path = storage.objects.name
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
      and (select private.class_has_current_photo_consent(a.class_id))
  )
);

drop policy if exists "completed_class_photos_storage_admin_insert"
on storage.objects;

create policy "completed_class_photos_storage_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'completed-class-photos'
  and (select public.is_admin())
  and exists (
    select 1
    from public.completed_classes as cc
    join public.applications as a on a.id = cc.application_id
    where cc.id::text = (storage.foldername(storage.objects.name))[1]
      and a.status in (
        'confirmed'::public.application_status,
        'completed'::public.application_status
      )
      and (select private.class_has_current_photo_consent(a.class_id))
  )
);

commit;
