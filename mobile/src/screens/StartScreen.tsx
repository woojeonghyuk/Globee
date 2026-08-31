import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import BrandWordmark from '@/src/components/BrandWordmark';
import { supabase } from '@/src/lib/supabase';
import { authColors } from '@/src/theme/auth';

const minimumSplashDurationMs = 1000;
const homeNavigationHideDelayMs = 80;

export default function StartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const splashStartedAt = useRef(Date.now()).current;
  const hasRevealedStart = useRef(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(18)).current;

  const isWideAndroid = Platform.OS === 'android' && width >= 520;
  const bottomPadding = Math.max(
    insets.bottom + 20,
    isWideAndroid ? 84 : 20,
  );

  useEffect(() => {
    let isMounted = true;
    let routeTimer: ReturnType<typeof setTimeout> | undefined;

    const revealStartScreen = async () => {
      if (!isMounted || hasRevealedStart.current) return;

      hasRevealedStart.current = true;
      await SplashScreen.hideAsync().catch(() => undefined);

      if (!isMounted) return;

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 460,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const waitForMinimumSplashTime = (callback: () => void) => {
      const remainingSplashTime = Math.max(
        minimumSplashDurationMs - (Date.now() - splashStartedAt),
        0,
      );

      routeTimer = setTimeout(callback, remainingSplashTime);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;

        waitForMinimumSplashTime(() => {
          if (!isMounted) return;

          if (data.session) {
            router.replace('/consent');

            setTimeout(() => {
              void SplashScreen.hideAsync().catch(() => undefined);
            }, homeNavigationHideDelayMs);
            return;
          }

          void revealStartScreen();
        });
      })
      .catch(() => {
        if (!isMounted) return;

        waitForMinimumSplashTime(() => {
          void revealStartScreen();
        });
      });

    return () => {
      isMounted = false;
      if (routeTimer) {
        clearTimeout(routeTimer);
      }
    };
  }, [contentOpacity, contentTranslateY, router, splashStartedAt]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentOpacity,
              paddingBottom: bottomPadding,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          <View>
            <BrandWordmark width={170} style={styles.brandLogo} />

            <Text style={styles.title}>
              가까운 유학생 선생님과{'\n'}
              아이의 첫 세계를 연결해요
            </Text>

            <Text style={styles.subtitle}>
              검증된 문화교류를 쉽고 편하게 찾아보고{'\n'}
              우리 아이에게 맞는 클래스를 신청해보세요
            </Text>
          </View>

          <View style={styles.bottomBlock}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => router.push('/signup')}
            >
              <Text style={styles.primaryButtonText}>
                회원가입하고 시작하기
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.browseButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/home',
                  params: { guestIntro: '1' },
                })
              }
            >
              <Text style={styles.browseButtonText}>
                로그인 없이 클래스 둘러보기
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/login')}
              hitSlop={10}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.linkPressed,
              ]}
            >
              <Text style={styles.linkText}>이미 계정이 있어요</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 80,
    justifyContent: 'space-between',
  },
  brandLogo: {
    marginBottom: 16,
  },
  title: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.6,
    marginBottom: 16,
  },
  subtitle: {
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.48,
  },
  bottomBlock: {
    gap: 10,
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: authColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    letterSpacing: -0.48,
  },
  browseButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: authColors.white,
    borderWidth: 1,
    borderColor: authColors.secondaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseButtonText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
    letterSpacing: -0.42,
  },
  loginButton: {
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    textAlign: 'center',
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
  linkPressed: {
    opacity: 0.72,
  },
});
