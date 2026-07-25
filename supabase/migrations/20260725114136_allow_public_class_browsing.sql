begin;

-- Guests may browse only classes that are currently open and have not started.
drop policy if exists "classes_select_public_open" on public.classes;
create policy "classes_select_public_open"
on public.classes
for select
to anon
using (
  is_open = true
  and starts_at >= now()
);

grant select on table public.classes to anon;
grant select on table public.classes_with_seats to anon;

-- The public view exposes only an aggregate seat count. Keep the helper scoped
-- to public, upcoming classes so arbitrary class UUIDs cannot reveal private data.
create or replace function public.get_active_application_count(p_class_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
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
        and a.status::text in ('신청 확인중', '신청 완료', '확정 대기')
    )
    else 0
  end;
$$;

revoke all privileges
on function public.get_active_application_count(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_active_application_count(uuid)
to anon, authenticated, service_role;

commit;
