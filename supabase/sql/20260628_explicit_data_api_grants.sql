begin;

-- Keep the Data API fail-closed for objects created after this migration.
-- Every future table, sequence, and RPC must opt in with an explicit grant.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from public;

-- Remove the legacy broad Data API grants before adding the exact privileges
-- used by the mobile app, admin web, and Edge Functions. RLS remains the row-
-- level authorization layer for authenticated requests.
revoke all privileges on table public.profiles
  from anon, authenticated, service_role;
revoke all privileges on table public.children
  from anon, authenticated, service_role;
revoke all privileges on table public.classes
  from anon, authenticated, service_role;
revoke all privileges on table public.applications
  from anon, authenticated, service_role;
revoke all privileges on table public.completed_classes
  from anon, authenticated, service_role;
revoke all privileges on table public.stamp_countries
  from anon, authenticated, service_role;
revoke all privileges on table public.completed_class_photos
  from anon, authenticated, service_role;
revoke all privileges on table public.application_notifications
  from anon, authenticated, service_role;

grant select, insert, update on table public.profiles
  to authenticated;
grant select, insert, update, delete on table public.children
  to authenticated;
grant select, insert, update, delete on table public.classes
  to authenticated;
grant select on table public.applications
  to authenticated;
grant update (status, updated_at) on table public.applications
  to authenticated;
grant select, insert, update, delete on table public.completed_classes
  to authenticated;
grant select, insert, update, delete on table public.stamp_countries
  to authenticated;
grant select, insert, update, delete on table public.completed_class_photos
  to authenticated;
grant select on table public.application_notifications
  to authenticated;

-- Edge Functions use the service role for account deletion and notification
-- delivery. The service role bypasses RLS but still needs table privileges.
grant select, insert, update, delete on table
  public.profiles,
  public.children,
  public.classes,
  public.applications,
  public.completed_classes,
  public.stamp_countries,
  public.completed_class_photos,
  public.application_notifications
  to service_role;

-- No current table uses a serial identity, but keep existing public sequences
-- usable by authenticated inserts and service-role maintenance. New sequences
-- still require an explicit grant because their default privileges were revoked.
revoke all privileges on all sequences in schema public
  from anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- The seats view is part of the authenticated mobile Data API surface.
revoke all privileges on table public.classes_with_seats
  from anon, authenticated, service_role;
grant select on table public.classes_with_seats
  to authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Restrict the
-- existing SECURITY DEFINER functions and expose only the intended RPCs.
revoke all privileges on function public.handle_new_auth_user_profile()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.mark_application_completed_from_completion()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.close_class_after_finalized_application()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.ensure_application_can_finalize()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.ensure_completed_class_application_ready()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.delete_completion_when_marked_no_show()
  from public, anon, authenticated, service_role;

revoke all privileges on function public.is_admin()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.apply_to_class(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.is_phone_registered(text)
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
revoke all privileges on function public.has_pending_review_applications_for_class(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_phone_registered(text)
  to anon, authenticated;

grant execute on function public.is_admin()
  to authenticated;
grant execute on function public.apply_to_class(uuid, uuid)
  to authenticated;
grant execute on function public.admin_confirm_application(uuid)
  to authenticated;
grant execute on function public.admin_cancel_pending_application(uuid)
  to authenticated;
grant execute on function public.admin_cancel_class(uuid)
  to authenticated;
grant execute on function public.admin_delete_class(uuid)
  to authenticated;
grant execute on function public.get_active_application_count(uuid)
  to authenticated;
grant execute on function public.has_pending_review_applications_for_class(uuid, uuid)
  to authenticated;

-- Service-role functions are kept explicit for backend maintenance and future
-- operational tooling. Trigger functions do not need client EXECUTE privileges.
grant execute on function public.is_admin()
  to service_role;
grant execute on function public.apply_to_class(uuid, uuid)
  to service_role;
grant execute on function public.is_phone_registered(text)
  to service_role;
grant execute on function public.admin_confirm_application(uuid)
  to service_role;
grant execute on function public.admin_cancel_pending_application(uuid)
  to service_role;
grant execute on function public.admin_cancel_class(uuid)
  to service_role;
grant execute on function public.admin_delete_class(uuid)
  to service_role;
grant execute on function public.get_active_application_count(uuid)
  to service_role;
grant execute on function public.has_pending_review_applications_for_class(uuid, uuid)
  to service_role;

commit;
