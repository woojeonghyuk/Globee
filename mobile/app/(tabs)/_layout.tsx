import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, Tabs } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { getCurrentGuardianConsent } from '@/src/lib/legalConsent';
import { authColors } from '@/src/theme/auth';
import { colors } from '@/src/theme/colors';

const mainBackgroundColor = '#FEF9E7';

const tabIcons = {
  home: ['home', 'home-outline'],
  applications: ['document-text', 'document-text-outline'],
  completed: ['checkmark-circle', 'checkmark-circle-outline'],
  my: ['person', 'person-outline'],
} as const;

type TabIconName = keyof typeof tabIcons | 'stamps';

function TabIcon({
  name,
  focused,
  color,
  size,
}: {
  name: TabIconName;
  focused: boolean;
  color: string;
  size: number;
}) {
  if (name === 'stamps') {
    return (
      <MaterialCommunityIcons
        name="stamper"
        color={color}
        size={size}
      />
    );
  }

  const [activeIcon, inactiveIcon] = tabIcons[name];

  return (
    <Ionicons
      name={focused ? activeIcon : inactiveIcon}
      color={color}
      size={size}
    />
  );
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={[
        styles.tabLabel,
        focused ? styles.activeTabLabel : styles.inactiveTabLabel,
      ]}
    >
      {label}
    </Text>
  );
}

function showLoginRequiredAlert() {
  Alert.alert(
    '로그인이 필요해요',
    '로그인 후 이용할 수 있는 메뉴예요.',
    [
      { text: '닫기', style: 'cancel' },
      { text: '로그인하기', onPress: () => router.push('/login') },
    ],
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [isAccessResolved, setIsAccessResolved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const resolveSessionAccess = async (
      session: { user: { id: string } } | null,
    ) => {
      if (!isMounted) return;

      if (!session) {
        setHasSession(false);
        setIsAccessResolved(true);
        return;
      }

      setHasSession(true);
      setIsAccessResolved(false);

      try {
        const consent = await getCurrentGuardianConsent(session.user.id);

        if (!isMounted) return;

        if (!consent) {
          router.replace('/consent');
          return;
        }

        setIsAccessResolved(true);
      } catch {
        if (isMounted) {
          router.replace('/consent');
        }
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        void resolveSessionAccess(data.session);
      })
      .catch(() => {
        if (isMounted) {
          setHasSession(false);
          setIsAccessResolved(true);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveSessionAccess(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (hasSession === null || !isAccessResolved) return null;

  return (
    <View style={styles.tabsBackground}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: styles.scene,
          tabBarActiveTintColor: authColors.navy,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            height: 58 + bottomInset,
            paddingTop: 10,
            paddingBottom: bottomInset,
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderTopWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            elevation: 0,
            shadowOpacity: 0,
            overflow: 'hidden',
          },
        }}
      >
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="홈" focused={focused} />
          ),
          tabBarIcon: (props) => <TabIcon name="home" {...props} />,
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: '신청',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="신청" focused={focused} />
          ),
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="applications" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) {
              event.preventDefault();
              showLoginRequiredAlert();
            }
          },
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: '완료',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="완료" focused={focused} />
          ),
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="completed" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) {
              event.preventDefault();
              showLoginRequiredAlert();
            }
          },
        }}
      />
      <Tabs.Screen
        name="stamps"
        options={{
          title: '스탬프',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="스탬프" focused={focused} />
          ),
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="stamps" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) {
              event.preventDefault();
              showLoginRequiredAlert();
            }
          },
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: '마이',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="마이" focused={focused} />
          ),
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="my" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) {
              event.preventDefault();
              showLoginRequiredAlert();
            }
          },
        }}
      />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBackground: {
    flex: 1,
    backgroundColor: mainBackgroundColor,
  },
  scene: {
    backgroundColor: mainBackgroundColor,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.36,
    textAlign: 'center',
  },
  activeTabLabel: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Bold',
  },
  inactiveTabLabel: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
  },
});
