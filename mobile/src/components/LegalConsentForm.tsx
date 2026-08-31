import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  LegalConsentValues,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from '@/src/lib/legalConsent';
import { authColors } from '@/src/theme/auth';

type LegalConsentFormProps = {
  value: LegalConsentValues;
  onChange: (nextValue: LegalConsentValues) => void;
  disabled?: boolean;
  compact?: boolean;
};

type ConsentKey =
  | 'termsAgreed'
  | 'privacyAgreed'
  | 'childDataAgreed'
  | 'overseasTransferAcknowledged'
  | 'activityPhotoAgreed';

export default function LegalConsentForm({
  value,
  onChange,
  disabled = false,
  compact = false,
}: LegalConsentFormProps) {
  const updateValue = <Key extends keyof LegalConsentValues>(
    key: Key,
    nextValue: LegalConsentValues[Key],
  ) => {
    if (disabled) return;
    onChange({ ...value, [key]: nextValue });
  };

  const toggleConsent = (key: ConsentKey) => {
    updateValue(key, !value[key]);
  };

  const requiredChecked =
    value.termsAgreed &&
    value.privacyAgreed &&
    value.childDataAgreed &&
    value.overseasTransferAcknowledged;
  const allChecked = requiredChecked && value.activityPhotoAgreed;

  const toggleAll = () => {
    const nextValue = !allChecked;
    onChange({
      ...value,
      termsAgreed: nextValue,
      privacyAgreed: nextValue,
      childDataAgreed: nextValue,
      overseasTransferAcknowledged: nextValue,
      activityPhotoAgreed: nextValue,
    });
  };

  const openDocument = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('페이지 열기 실패', '잠시 후 다시 시도해주세요.');
    }
  };

  const renderCheck = (checked: boolean) => (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? (
        <Ionicons name="checkmark" size={15} color={authColors.white} />
      ) : null}
    </View>
  );

  const renderConsentRow = ({
    key,
    label,
    url,
    detail,
  }: {
    key: ConsentKey;
    label: string;
    url?: string;
    detail?: string;
  }) => {
    const displayedDetail = compact
      ? key === 'overseasTransferAcknowledged'
        ? '데이터는 암호화되어 일본(도쿄) 리전에 저장됩니다.'
        : undefined
      : detail;

    return (
      <View style={[styles.consentItem, compact && styles.consentItemCompact]}>
        <View style={styles.consentRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value[key], disabled }}
            disabled={disabled}
            onPress={() => toggleConsent(key)}
            style={styles.consentLabelButton}
          >
            {renderCheck(value[key])}
            <Text style={styles.consentLabel}>{label}</Text>
          </Pressable>

          {url ? (
            <Pressable onPress={() => void openDocument(url)} hitSlop={8}>
              <Text style={styles.documentLink}>보기</Text>
            </Pressable>
          ) : null}
        </View>

        {displayedDetail ? (
          <Text
            style={[
              styles.consentDetail,
              compact && styles.consentDetailCompact,
            ]}
          >
            {displayedDetail}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked, disabled }}
        disabled={disabled}
        onPress={toggleAll}
        style={styles.allConsentRow}
      >
        {renderCheck(allChecked)}
        <Text style={styles.allConsentText}>전체 동의</Text>
      </Pressable>

      <View style={styles.divider} />

      {renderConsentRow({
        key: 'termsAgreed',
        label: '[필수] 이용약관에 동의합니다.',
        url: TERMS_URL,
      })}
      {renderConsentRow({
        key: 'privacyAgreed',
        label: '[필수] 보호자 개인정보 수집·이용에 동의합니다.',
        url: `${PRIVACY_POLICY_URL}#collection`,
      })}
      {renderConsentRow({
        key: 'childDataAgreed',
        label: '[필수] 아이 개인정보 수집·이용에 동의하며 법정대리인임을 확인합니다.',
        url: `${PRIVACY_POLICY_URL}#children`,
        detail:
          '이름·나이·학교/학년·관심사·신청 및 완료 기록을 아이 또는 계정 삭제 시까지 처리합니다.',
      })}
      {renderConsentRow({
        key: 'overseasTransferAcknowledged',
        label: '[필수] 서비스 제공을 위한 개인정보 국외 이전에 동의합니다.',
        url: `${PRIVACY_POLICY_URL}#overseas-transfer`,
        detail:
          'Globee는 인증과 데이터 보관을 위해 Supabase가 제공하는 일본(도쿄) 리전을 이용하며, 전송 과정은 암호화됩니다.',
      })}
      {renderConsentRow({
        key: 'activityPhotoAgreed',
        label: '[선택] 문화교류 활동 사진의 등록 및 앱 제공에 동의합니다.',
        url: `${PRIVACY_POLICY_URL}#photos`,
        detail: '동의하지 않아도 아이 등록과 문화교류 신청은 이용할 수 있습니다.',
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: 16,
    gap: 12,
  },
  containerCompact: {
    padding: 14,
    gap: 9,
  },
  allConsentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  allConsentText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 15,
  },
  divider: {
    height: 1,
    backgroundColor: authColors.divider,
  },
  consentItem: {
    gap: 5,
  },
  consentItemCompact: {
    gap: 2,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  consentLabelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: authColors.secondaryBorder,
    backgroundColor: authColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: authColors.navy,
    backgroundColor: authColors.navy,
  },
  consentLabel: {
    flex: 1,
    color: authColors.text,
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    lineHeight: 19,
  },
  documentLink: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  consentDetail: {
    marginLeft: 29,
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 11,
    lineHeight: 17,
  },
  consentDetailCompact: {
    fontSize: 10,
    lineHeight: 15,
  },
});
