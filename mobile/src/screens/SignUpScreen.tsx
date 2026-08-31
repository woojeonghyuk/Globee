import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import BrandWordmark from '@/src/components/BrandWordmark';
import LegalConsentForm from '@/src/components/LegalConsentForm';
import { markChildRegistrationGuidePending } from '@/src/lib/childRegistrationGuide';
import {
  getOtpSendErrorMessage,
  getOtpVerificationErrorMessage,
  getPasswordUpdateErrorMessage,
} from '@/src/lib/authMessages';
import {
  formatKoreanPhoneInput,
  getPasswordValidationError,
  isValidKoreanPhone,
  normalizeKoreanPhone,
} from '@/src/lib/phone';
import { goBackOrStart } from '@/src/lib/navigation';
import {
  getCurrentGuardianConsent,
  hasAcceptedRequiredLegalConsents,
  initialLegalConsentValues,
  recordGuardianConsent,
} from '@/src/lib/legalConsent';
import { supabase } from '@/src/lib/supabase';
import { useAuthScreenBackHandler } from '@/src/lib/useAuthScreenBackHandler';
import { authColors } from '@/src/theme/auth';

type SignUpStep = 'phone' | 'code' | 'password';

const otpExpirySeconds = 180;
const resendCooldownSeconds = 60;

function formatOtpTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

export default function SignUpScreen() {
  useAuthScreenBackHandler();

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<SignUpStep>('phone');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [legalConsent, setLegalConsent] = useState(initialLegalConsentValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const [resendRemainingSeconds, setResendRemainingSeconds] = useState(0);
  const otpRequestInFlight = useRef(false);
  const isWideAndroid = Platform.OS === 'android' && width >= 520;
  const bottomPadding = Math.max(
    insets.bottom + 20,
    isWideAndroid ? 84 : 20,
  );

  useEffect(() => {
    if (step !== 'code') return undefined;
    if (otpRemainingSeconds <= 0 && resendRemainingSeconds <= 0) return undefined;

    const timerId = setInterval(() => {
      setOtpRemainingSeconds((current) => Math.max(current - 1, 0));
      setResendRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timerId);
  }, [otpRemainingSeconds, resendRemainingSeconds, step]);

  const startOtpCountdown = () => {
    setOtpRemainingSeconds(otpExpirySeconds);
    setResendRemainingSeconds(resendCooldownSeconds);
  };

  const ensureParentProfile = async (userId: string, normalizedPhone: string) => {
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        full_name: '학부모',
        phone: normalizedPhone,
      },
      { onConflict: 'id' },
    );

    if (error) throw error;
  };

  const requestSignUpOtp = async (normalizedPhone: string) => {
    return supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: {
          phone: normalizedPhone,
        },
      },
    });
  };

  const handleRequestVerification = async () => {
    if (isSubmitting || otpRequestInFlight.current) return;

    if (!hasAcceptedRequiredLegalConsents(legalConsent)) {
      Alert.alert(
        '필수 동의 확인',
        '필수 동의 내용을 모두 확인해주세요.',
      );
      return;
    }

    if (!isValidKoreanPhone(phone)) {
      Alert.alert('입력 확인', '휴대폰 번호를 정확히 입력해주세요.');
      return;
    }

    otpRequestInFlight.current = true;
    setIsSubmitting(true);

    const normalizedPhone = normalizeKoreanPhone(phone);
    try {
      const { error } = await requestSignUpOtp(normalizedPhone);

      if (error) {
        Alert.alert('인증번호 발송 실패', getOtpSendErrorMessage(error.message));
        return;
      }

      setPendingPhone(normalizedPhone);
      setVerificationCode('');
      startOtpCountdown();
      setStep('code');
      Alert.alert('인증번호 발송', '문자로 받은 인증번호를 입력해주세요.');
    } catch {
      Alert.alert('인증번호 발송 실패', getOtpSendErrorMessage());
    } finally {
      otpRequestInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (isSubmitting) return;

    if (otpRemainingSeconds <= 0) {
      Alert.alert(
        '인증시간 만료',
        '인증번호 시간이 만료됐어요. 인증번호를 다시 받아주세요.',
      );
      return;
    }

    const token = verificationCode.replace(/[^0-9]/g, '');
    if (token.length < 4) {
      Alert.alert('입력 확인', '문자로 받은 인증번호를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    const normalizedPhone = pendingPhone || normalizeKoreanPhone(phone);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: 'sms',
    });

    if (error) {
      setIsSubmitting(false);
      Alert.alert('인증 실패', getOtpVerificationErrorMessage(error.message));
      return;
    }

    if (!data.user) {
      setIsSubmitting(false);
      Alert.alert(
        '인증 확인 실패',
        '인증된 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      return;
    }

    try {
      const currentConsent = await getCurrentGuardianConsent(data.user.id);

      if (currentConsent) {
        setIsSubmitting(false);
        Alert.alert(
          '로그인 완료',
          '이미 가입된 계정으로 로그인했어요.',
          [
            {
              text: '확인',
              onPress: () => router.replace('/(tabs)/home'),
            },
          ],
        );
        return;
      }
    } catch {
      setIsSubmitting(false);
      Alert.alert(
        '가입 상태 확인 실패',
        '계정 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      return;
    }

    setIsSubmitting(false);
    setStep('password');
    Alert.alert('인증 완료', '전화번호 인증에 성공했어요. 비밀번호를 설정해주세요.');
  };

  const handleResendVerification = async () => {
    if (
      isSubmitting ||
      otpRequestInFlight.current ||
      step !== 'code' ||
      resendRemainingSeconds > 0
    ) {
      return;
    }

    const normalizedPhone = pendingPhone || normalizeKoreanPhone(phone);
    if (!normalizedPhone) return;

    otpRequestInFlight.current = true;
    setIsSubmitting(true);

    try {
      const { error } = await requestSignUpOtp(normalizedPhone);

      if (error) {
        Alert.alert('재전송 실패', getOtpSendErrorMessage(error.message));
        return;
      }

      setVerificationCode('');
      startOtpCountdown();
      Alert.alert('인증번호 재전송', '새 인증번호를 문자로 보냈어요.');
    } catch {
      Alert.alert('재전송 실패', getOtpSendErrorMessage());
    } finally {
      otpRequestInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleCompleteSignUp = async () => {
    if (isSubmitting) return;

    if (!hasAcceptedRequiredLegalConsents(legalConsent)) {
      Alert.alert('필수 동의 확인', '필수 동의 내용을 모두 확인해주세요.');
      return;
    }

    const passwordError = getPasswordValidationError(password, phone);
    if (passwordError) {
      Alert.alert('입력 확인', passwordError);
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert('입력 확인', '비밀번호가 서로 일치하지 않아요.');
      return;
    }

    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setIsSubmitting(false);
      Alert.alert('회원가입 실패', getPasswordUpdateErrorMessage(updateError.message));
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        await ensureParentProfile(user.id, pendingPhone || normalizeKoreanPhone(phone));
        await recordGuardianConsent(legalConsent, 'signup');
        await markChildRegistrationGuidePending(user.id);
      } catch {
        setIsSubmitting(false);
        Alert.alert(
          '회원가입 확인 필요',
          '계정은 만들어졌지만 보호자 정보를 저장하지 못했어요. 잠시 후 다시 로그인해주세요.',
        );
        return;
      }
    }

    setIsSubmitting(false);
    Alert.alert('회원가입 완료', '회원가입이 완료되었습니다.', [
      {
        text: '확인',
        onPress: () => router.replace('/(tabs)/home'),
      },
    ]);
  };

  const handlePrimaryAction = async () => {
    if (step === 'phone') {
      await handleRequestVerification();
      return;
    }

    if (step === 'code') {
      await handleVerifyCode();
      return;
    }

    await handleCompleteSignUp();
  };

  const primaryButtonText = isSubmitting
    ? '확인 중'
    : step === 'phone'
      ? '인증번호 받기'
      : step === 'code'
        ? '인증하기'
        : '회원가입 완료하기';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainArea}>
            <Pressable
              onPress={goBackOrStart}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.buttonPressed,
              ]}
              hitSlop={10}
            >
              <Ionicons name="arrow-back" size={28} color={authColors.navy} />
            </Pressable>

            <View style={styles.headerArea}>
              <BrandWordmark width={157} style={styles.brandLogo} />
              <Text style={styles.title}>회원가입</Text>
              <Text style={styles.subtitle}>
                전화번호를 인증한 뒤 비밀번호를 설정해주세요
              </Text>
            </View>

            <View
              style={[
                styles.formArea,
                step === 'phone' && styles.phoneFormArea,
              ]}
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>전화번호 (보호자)</Text>
                <TextInput
                  value={phone}
                  onChangeText={(value) => setPhone(formatKoreanPhoneInput(value))}
                  placeholder="휴대폰 번호를 입력해주세요"
                  placeholderTextColor={authColors.placeholder}
                  keyboardType="phone-pad"
                  editable={step === 'phone' && !isSubmitting}
                  style={styles.input}
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                />
              </View>

            {step !== 'phone' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>인증번호</Text>
                <TextInput
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="문자로 받은 인증번호를 입력해주세요"
                placeholderTextColor={authColors.placeholder}
                  keyboardType="number-pad"
                  maxLength={8}
                  editable={step === 'code' && !isSubmitting}
                  style={styles.input}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
                {step === 'code' && (
                  <View style={styles.codeMetaRow}>
                    <Text style={styles.timerText}>
                      남은 시간 {formatOtpTime(otpRemainingSeconds)}
                    </Text>
                    <Pressable
                      disabled={isSubmitting || resendRemainingSeconds > 0}
                      onPress={handleResendVerification}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.resendButton,
                        resendRemainingSeconds > 0 && styles.resendButtonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.resendButtonText,
                          resendRemainingSeconds > 0 &&
                            styles.resendButtonTextDisabled,
                        ]}
                      >
                        {resendRemainingSeconds > 0
                          ? `재전송 ${resendRemainingSeconds}초`
                          : '인증번호 재전송'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {step === 'password' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>비밀번호</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="8~20자로 입력해주세요"
                    placeholderTextColor={authColors.placeholder}
                    secureTextEntry
                    maxLength={20}
                    style={styles.input}
                    textContentType="newPassword"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>비밀번호 확인</Text>
                  <TextInput
                    value={passwordConfirm}
                    onChangeText={setPasswordConfirm}
                    placeholder="비밀번호를 다시 입력해주세요"
                    placeholderTextColor={authColors.placeholder}
                    secureTextEntry
                    maxLength={20}
                    style={styles.input}
                    textContentType="newPassword"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </>
            )}

              {step === 'phone' ? (
                <LegalConsentForm
                  value={legalConsent}
                  onChange={setLegalConsent}
                  disabled={isSubmitting}
                  compact
                />
              ) : null}

              <Pressable
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.signUpButton,
                  isSubmitting && styles.signUpButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handlePrimaryAction}
              >
                <Text style={styles.signUpButtonText}>{primaryButtonText}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footerArea}>
            <Pressable onPress={() => router.replace('/login')} hitSlop={10}>
              <Text style={styles.footerLink}>이미 계정이 있어요</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: authColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: authColors.background,
    overflow: 'hidden',
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: authColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    justifyContent: 'space-between',
  },
  mainArea: {
    width: '100%',
  },
  headerArea: {
    alignItems: 'flex-start',
  },
  brandLogo: {
    marginBottom: 20,
  },
  title: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  subtitle: {
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.48,
  },
  formArea: {
    marginTop: 80,
    gap: 20,
  },
  phoneFormArea: {
    marginTop: 28,
    gap: 14,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    letterSpacing: -0.7,
  },
  input: {
    height: 46,
    borderRadius: 16,
    backgroundColor: authColors.input,
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    letterSpacing: -0.8,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  codeMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  timerText: {
    color: authColors.timer,
    fontFamily: 'Pretendard-Medium',
    fontSize: 12,
  },
  resendButton: {
    paddingVertical: 4,
  },
  resendButtonDisabled: {
    opacity: 0.55,
  },
  resendButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  resendButtonTextDisabled: {
    color: authColors.placeholder,
  },
  signUpButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: authColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signUpButtonDisabled: {
    opacity: 0.58,
  },
  signUpButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    letterSpacing: -0.48,
  },
  footerArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLink: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
    letterSpacing: -0.42,
    textDecorationLine: 'underline',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
