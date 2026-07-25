import { useEffect, useState } from 'react';
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
import { router } from 'expo-router';

import BrandWordmark from '@/src/components/BrandWordmark';
import { markChildRegistrationGuidePending } from '@/src/lib/childRegistrationGuide';
import {
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
import { supabase } from '@/src/lib/supabase';
import { useAuthScreenBackHandler } from '@/src/lib/useAuthScreenBackHandler';
import { colors } from '@/src/theme/colors';

type SignUpStep = 'phone' | 'code' | 'password';

const otpExpirySeconds = 180;
const resendCooldownSeconds = 60;

function formatOtpTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

function createTemporaryPassword() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let value = '';

  for (let index = 0; index < 20; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `G${value}1`;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const [resendRemainingSeconds, setResendRemainingSeconds] = useState(0);
  const isWideAndroid = Platform.OS === 'android' && width >= 520;
  const bottomPadding = Math.max(
    insets.bottom + 28,
    isWideAndroid ? 92 : 42,
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
        role: 'parent',
        full_name: '학부모',
        phone: normalizedPhone,
      },
      { onConflict: 'id' },
    );

    if (error) throw error;
  };

  const handleRequestVerification = async () => {
    if (isSubmitting) return;

    if (!isValidKoreanPhone(phone)) {
      Alert.alert('입력 확인', '휴대폰 번호를 정확히 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    const normalizedPhone = normalizeKoreanPhone(phone);
    const { data: isRegistered, error: registrationCheckError } =
      await supabase.rpc('is_phone_registered', {
        p_phone: normalizedPhone,
      });

    if (registrationCheckError) {
      setIsSubmitting(false);
      Alert.alert(
        '가입 여부 확인 실패',
        '전화번호 가입 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      return;
    }

    if (isRegistered) {
      setIsSubmitting(false);
      Alert.alert(
        '이미 가입된 아이디입니다',
        '로그인하거나 비밀번호 찾기를 이용해주세요.',
      );
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      phone: normalizedPhone,
      password: createTemporaryPassword(),
      options: {
        channel: 'sms',
        data: {
          phone: normalizedPhone,
        },
      },
    });

    if (error) {
      setIsSubmitting(false);
      const message = error.message.toLowerCase().includes('already')
        ? '이미 가입했거나 인증이 진행 중인 전화번호입니다. 로그인하거나 비밀번호 찾기를 이용해주세요.'
        : '인증번호를 보내지 못했어요. 잠시 후 다시 시도해주세요.';
      Alert.alert('인증번호 발송 실패', message);
      return;
    }

    setPendingPhone(normalizedPhone);
    setVerificationCode('');
    startOtpCountdown();
    setIsSubmitting(false);

    if (data.session && data.user) {
      setStep('password');
      Alert.alert('인증 완료', '전화번호 인증에 성공했어요. 비밀번호를 설정해주세요.');
      return;
    }

    setStep('code');
    Alert.alert('인증번호 발송', '문자로 받은 인증번호를 입력해주세요.');
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
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: 'sms',
    });

    if (error) {
      setIsSubmitting(false);
      Alert.alert('인증 실패', getOtpVerificationErrorMessage(error.message));
      return;
    }

    setIsSubmitting(false);
    setStep('password');
    Alert.alert('인증 완료', '전화번호 인증에 성공했어요. 비밀번호를 설정해주세요.');
  };

  const handleResendVerification = async () => {
    if (isSubmitting || step !== 'code' || resendRemainingSeconds > 0) return;

    const normalizedPhone = pendingPhone || normalizeKoreanPhone(phone);
    if (!normalizedPhone) return;

    setIsSubmitting(true);

    const { error } = await supabase.auth.resend({
      type: 'sms',
      phone: normalizedPhone,
    });

    setIsSubmitting(false);

    if (error) {
      Alert.alert('재전송 실패', '인증번호를 다시 보내지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    setVerificationCode('');
    startOtpCountdown();
    Alert.alert('인증번호 재전송', '새 인증번호를 문자로 보냈어요.');
  };

  const handleCompleteSignUp = async () => {
    if (isSubmitting) return;

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
        <View style={styles.bgCircleTop} />
        <View style={styles.bgCircleBottom} />

        <Pressable onPress={goBackOrStart} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerArea}>
            <BrandWordmark width={148} style={styles.brandLogo} />
            <Text style={styles.title}>회원가입</Text>
            <Text style={styles.subtitle}>
              전화번호를 인증한 뒤 비밀번호를 설정해주세요
            </Text>
          </View>

          <View style={styles.formArea}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>전화번호(보호자)</Text>
              <TextInput
                value={phone}
                onChangeText={(value) => setPhone(formatKoreanPhoneInput(value))}
                placeholder="휴대폰 번호를 입력해주세요"
                placeholderTextColor={colors.muted}
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
                  placeholderTextColor={colors.muted}
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
                    placeholderTextColor={colors.muted}
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
                    placeholderTextColor={colors.muted}
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

          <View style={styles.footerArea}>
            <Pressable onPress={() => router.replace('/login')} hitSlop={10}>
              <Text style={styles.footerLink}>이미 계정이 있다면 로그인</Text>
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
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  bgCircleTop: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#DDEDFC',
    opacity: 0.95,
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -150,
    left: -90,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: '#F7EBA6',
    opacity: 0.95,
  },
  backButton: {
    position: 'absolute',
    top: 54,
    left: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  backText: {
    color: colors.navy,
    fontSize: 35,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingTop: 78,
    paddingBottom: 30,
    justifyContent: 'space-between',
  },
  headerArea: {
    alignItems: 'center',
    marginTop: 4,
  },
  brandLogo: {
    marginBottom: 16,
  },
  title: {
    color: colors.navy,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  formArea: {
    marginTop: 10,
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: colors.navySoft,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    height: 50,
    color: colors.navy,
    fontSize: 18,
    fontWeight: '600',
    borderBottomWidth: 1.2,
    borderBottomColor: colors.lineStrong,
    paddingHorizontal: 0,
  },
  codeMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  timerText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '800',
  },
  resendButton: {
    paddingVertical: 4,
  },
  resendButtonDisabled: {
    opacity: 0.55,
  },
  resendButtonText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  resendButtonTextDisabled: {
    color: colors.muted,
  },
  signUpButton: {
    marginTop: 12,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signUpButtonDisabled: {
    opacity: 0.58,
  },
  signUpButtonText: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  footerArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  footerLink: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
