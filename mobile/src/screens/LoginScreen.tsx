import { useState } from 'react';
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
import { Href, router } from 'expo-router';

import BrandWordmark from '@/src/components/BrandWordmark';
import {
  formatKoreanPhoneInput,
  getPasswordValidationError,
  isValidKoreanPhone,
  normalizeKoreanPhone,
} from '@/src/lib/phone';
import { goBackOrStart } from '@/src/lib/navigation';
import { supabase } from '@/src/lib/supabase';
import { useAuthScreenBackHandler } from '@/src/lib/useAuthScreenBackHandler';
import { authColors } from '@/src/theme/auth';

const resetPasswordRoute = '/reset-password' as Href;

export default function LoginScreen() {
  useAuthScreenBackHandler();

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isWideAndroid = Platform.OS === 'android' && width >= 520;
  const bottomPadding = Math.max(
    insets.bottom + 20,
    isWideAndroid ? 84 : 20,
  );

  const handleLogin = async () => {
    if (isSubmitting) return;

    if (!isValidKoreanPhone(phone)) {
      Alert.alert('입력 확인', '휴대폰 번호를 정확히 입력해주세요.');
      return;
    }

    const passwordError = getPasswordValidationError(password, phone);
    if (passwordError) {
      Alert.alert('입력 확인', passwordError);
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      phone: normalizeKoreanPhone(phone),
      password,
    });

    if (error) {
      setIsSubmitting(false);
      Alert.alert(
        '로그인 실패',
        '휴대폰 번호 또는 비밀번호가 맞지 않아요.\n다시 확인해주세요.',
      );
      return;
    }

    setIsSubmitting(false);
    router.replace('/consent');
  };

  const handleLoginHelp = () => {
    Alert.alert('로그인 문의', '인스타그램 @globee_st 계정으로 문의해주세요.');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              <Text style={styles.title}>로그인</Text>
              <Text style={styles.subtitle}>
                보호자 전화번호와 비밀번호로 시작해요
              </Text>
            </View>

            <View style={styles.formArea}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>휴대폰 번호</Text>
                <TextInput
                  value={phone}
                  onChangeText={(value) => setPhone(formatKoreanPhoneInput(value))}
                  placeholder="휴대폰 번호를 입력해주세요"
                  placeholderTextColor={authColors.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>비밀번호</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="비밀번호를 입력해주세요"
                  placeholderTextColor={authColors.placeholder}
                  secureTextEntry
                  style={styles.input}
                  maxLength={20}
                  textContentType="password"
                  autoComplete="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Pressable
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.loginButton,
                  isSubmitting && styles.loginButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleLogin}
              >
                <Text style={styles.loginButtonText}>
                  {isSubmitting ? '로그인 중' : '로그인'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footerArea}>
            <Pressable onPress={() => router.replace('/signup')} hitSlop={10}>
              <Text style={styles.footerLink}>회원가입</Text>
            </Pressable>

            <View style={styles.footerDivider} />

            <Pressable onPress={() => router.replace(resetPasswordRoute)} hitSlop={10}>
              <Text style={styles.footerLink}>비밀번호 찾기</Text>
            </Pressable>

            <View style={styles.footerDivider} />

            <Pressable onPress={handleLoginHelp} hitSlop={10}>
              <Text style={styles.footerLink}>로그인 문의</Text>
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
  loginButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: authColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.58,
  },
  loginButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    letterSpacing: -0.48,
  },
  footerArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerLink: {
    color: '#505050',
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    letterSpacing: -0.42,
  },
  footerDivider: {
    width: 1,
    height: 14,
    backgroundColor: authColors.divider,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
