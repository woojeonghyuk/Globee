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
import { colors } from '@/src/theme/colors';

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
    insets.bottom + 28,
    isWideAndroid ? 92 : 42,
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
            router.replace('/(tabs)/home');

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
        <View style={styles.bgCircleTop} />
        <View style={styles.bgCircleBottom} />

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
          <View style={styles.topBlock}>
            <BrandWordmark width={150} style={styles.brandLogo} />

            <Text style={styles.title}>
              가까운 유학생 선생님과{'\n'}
              아이의 첫 세계를 연결해요
            </Text>

            <Text style={styles.subtitle}>
              검증된 문화교류를 쉽고 편하게 찾아보고{'\n'}
              우리 아이에게 맞는 클래스를 신청해보세요.
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
              style={({ pressed }) => pressed && styles.linkPressed}
            >
              <Text style={styles.linkText}>이미 계정이 있다면 로그인</Text>
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

  content: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },

  topBlock: {
    paddingTop: 6,
  },
  brandLogo: {
    marginBottom: 34,
  },
  title: {
    color: colors.navy,
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 22,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 26,
    fontWeight: '700',
  },

  bottomBlock: {
    paddingBottom: 6,
  },
  primaryButton: {
    height: 62,
    borderRadius: 24,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  browseButton: {
    height: 54,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseButtonText: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  linkText: {
    marginTop: 18,
    textAlign: 'center',
    color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
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
