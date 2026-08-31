import { supabase } from '@/src/lib/supabase';

export const PRIVACY_POLICY_VERSION = '2026-08-05';
export const TERMS_VERSION = '2026-08-05';

export const PRIVACY_POLICY_URL = 'https://globee.ai.kr/privacy.html';
export const TERMS_URL = 'https://globee.ai.kr/terms.html';

export type LegalConsentValues = {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  childDataAgreed: boolean;
  overseasTransferAcknowledged: boolean;
  activityPhotoAgreed: boolean;
};

export type GuardianConsentRecord = {
  id: string;
  activity_photo_agreed: boolean;
  created_at: string;
};

export const initialLegalConsentValues: LegalConsentValues = {
  termsAgreed: false,
  privacyAgreed: false,
  childDataAgreed: false,
  overseasTransferAcknowledged: false,
  activityPhotoAgreed: false,
};

export function hasAcceptedRequiredLegalConsents(values: LegalConsentValues) {
  return (
    values.termsAgreed &&
    values.privacyAgreed &&
    values.childDataAgreed &&
    values.overseasTransferAcknowledged
  );
}

export async function getCurrentGuardianConsent(userId: string) {
  const { data, error } = await supabase
    .from('guardian_consent_records')
    .select('id,activity_photo_agreed,created_at')
    .eq('parent_id', userId)
    .eq('privacy_policy_version', PRIVACY_POLICY_VERSION)
    .eq('terms_version', TERMS_VERSION)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as GuardianConsentRecord | null) ?? null;
}

export async function recordGuardianConsent(
  values: LegalConsentValues,
  source: 'signup' | 'existing_user' | 'settings',
) {
  if (!hasAcceptedRequiredLegalConsents(values)) {
    throw new Error('필수 동의 내용을 모두 확인해 주세요.');
  }

  const { error } = await supabase.rpc('record_guardian_consent_v2', {
    p_privacy_policy_version: PRIVACY_POLICY_VERSION,
    p_terms_version: TERMS_VERSION,
    p_activity_photo_agreed: values.activityPhotoAgreed,
    p_source: source,
  });

  if (error) throw error;
}
