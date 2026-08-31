begin;

-- An administrator must not be able to move an existing photo record to a
-- class that does not have current consent from every actual participant.
create policy "completed_class_photos_photo_consent_update"
on public.completed_class_photos
as restrictive
for update
to authenticated
using (
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
)
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

-- Supabase Storage replace/upsert operations use UPDATE once an object exists.
-- Apply the same class-wide consent gate to both the existing and new path.
drop policy if exists "completed_class_photos_storage_admin_update"
on storage.objects;

create policy "completed_class_photos_storage_admin_update"
on storage.objects
for update
to authenticated
using (
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
)
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
