import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import BrandWordmark from '@/src/components/BrandWordmark';
import LegalConsentForm from '@/src/components/LegalConsentForm';
import {
  getCurrentGuardianConsent,
  initialLegalConsentValues,
  LegalConsentValues,
  recordGuardianConsent,
} from '@/src/lib/legalConsent';
import { supabase } from '@/src/lib/supabase';
import { useCompletedRecords } from '@/src/state/CompletedRecordsContext';
import { authColors } from '@/src/theme/auth';

export default function LegalConsentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { refreshCompletedRecords } = useCompletedRecords();
  const isSettingsMode = params.mode === 'settings';
  const [values, setValues] = useState<LegalConsentValues>(
    initialLegalConsentValues,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadConsent = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace('/login');
          return;
        }

        const currentConsent = await getCurrentGuardianConsent(user.id);

        if (!isMounted) return;

        if (currentConsent && !isSettingsMode) {
          router.replace('/(tabs)/home');
          return;
        }

        setValues({
          termsAgreed: Boolean(currentConsent),
          privacyAgreed: Boolean(currentConsent),
          childDataAgreed: Boolean(currentConsent),
          overseasTransferAcknowledged: Boolean(currentConsent),
          activityPhotoAgreed:
            currentConsent?.activity_photo_agreed ?? false,
        });
      } catch {
        if (isMounted) {
          Alert.alert(
            '동의 정보 확인 실패',
            '잠시 후 다시 시도해주세요.',
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadConsent();

    return () => {
      isMounted = false;
    };
  }, [isSettingsMode]);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);

    try {
      await recordGuardianConsent(
        values,
        isSettingsMode ? 'settings' : 'existing_user',
      );
      await refreshCompletedRecords();

      Alert.alert(
        isSettingsMode ? '동의 설정 저장' : '보호자 동의 완료',
        isSettingsMode
          ? '동의 설정을 저장했어요.'
          : '확인해주셔서 감사합니다.',
        [
          {
            text: '확인',
            onPress: () => {
              if (isSettingsMode && router.canGoBack()) {
                router.back();
                return;
              }

              router.replace('/(tabs)/home');
            },
          },
        ],
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '동의 내용을 저장하지 못했어요.';
      Alert.alert('저장 실패', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (isLoading) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          !isSettingsMode && styles.contentWithoutBackButton,
          { paddingBottom: Math.max(insets.bottom + 24, 32) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isSettingsMode ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
            hitSlop={10}
          >
            <Ionicons name="arrow-back" size={28} color={authColors.navy} />
          </Pressable>
        ) : null}

        <View style={styles.header}>
          <BrandWordmark width={157} style={styles.brandLogo} />
          <Text style={styles.title}>
            {isSettingsMode ? '동의 및 개인정보 관리' : '보호자 동의가 필요해요'}
          </Text>
          <Text style={styles.subtitle}>
            아이 정보를 안전하게 보호하기 위해{`\n`}
            아래 내용을 각각 확인해주세요.
          </Text>
        </View>

        <LegalConsentForm
          value={values}
          onChange={setValues}
          disabled={isSaving}
        />

        <View style={styles.actions}>
          <Pressable
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              isSaving && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? '저장 중' : '동의하고 계속하기'}
            </Text>
          </Pressable>

          {!isSettingsMode ? (
            <Pressable onPress={handleLogout} hitSlop={10}>
              <Text style={styles.logoutText}>동의하지 않고 로그아웃</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: authColors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 26,
  },
  contentWithoutBackButton: {
    paddingTop: 88,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: authColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'flex-start',
  },
  brandLogo: {
    marginBottom: 20,
  },
  title: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.66,
    marginBottom: 8,
  },
  subtitle: {
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: -0.45,
  },
  actions: {
    alignItems: 'center',
    gap: 16,
  },
  saveButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: authColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  saveButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    letterSpacing: -0.48,
  },
  logoutText: {
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
});
