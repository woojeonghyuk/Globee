begin;

-- A guardian relationship is not required by the app's phone-verified consent
-- flow. Preserve historical values, but stop requiring or writing the field for
-- all new consent records.
alter table public.guardian_consent_records
alter column guardian_relationship drop not null;

comment on column public.guardian_consent_records.guardian_relationship is
  'Historical consent snapshot only. New consent records do not collect this value.';

create or replace function private.record_guardian_consent_v2(
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
on function private.record_guardian_consent_v2(text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function private.record_guardian_consent_v2(text, text, boolean, text)
to authenticated;

-- Existing app versions still call record_guardian_consent with guardian name
-- and/or relationship parameters. Keep those public wrappers working, while
-- ignoring both obsolete values and forwarding to the new implementation.
create or replace function private.record_guardian_consent(
  p_guardian_relationship text,
  p_privacy_policy_version text,
  p_terms_version text,
  p_activity_photo_agreed boolean,
  p_source text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_guardian_consent_v2(
    p_privacy_policy_version,
    p_terms_version,
    p_activity_photo_agreed,
    p_source
  );
$function$;

revoke all privileges
on function private.record_guardian_consent(text, text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function private.record_guardian_consent(text, text, text, boolean, text)
to authenticated;

create or replace function public.record_guardian_consent_v2(
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
  select private.record_guardian_consent_v2(
    p_privacy_policy_version,
    p_terms_version,
    p_activity_photo_agreed,
    p_source
  );
$function$;

revoke all privileges
on function public.record_guardian_consent_v2(text, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute
on function public.record_guardian_consent_v2(text, text, boolean, text)
to authenticated;

commit;
