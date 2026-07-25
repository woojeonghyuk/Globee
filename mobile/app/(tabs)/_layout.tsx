import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';

const tabIcons = {
  home: ['home', 'home-outline'],
  applications: ['receipt', 'receipt-outline'],
  completed: ['albums', 'albums-outline'],
  stamps: ['map', 'map-outline'],
  my: ['person', 'person-outline'],
} as const;

type TabIconName = keyof typeof tabIcons;

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
  const [activeIcon, inactiveIcon] = tabIcons[name];

  return (
    <Ionicons
      name={focused ? activeIcon : inactiveIcon}
      color={color}
      size={size}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;

        setHasSession(Boolean(data.session));
      })
      .catch(() => {
        if (isMounted) {
          setHasSession(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      setHasSession(Boolean(session));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (hasSession === null) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
        tabBarStyle: {
          height: 62 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          backgroundColor: colors.white,
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: (props) => <TabIcon name="home" {...props} />,
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: '신청',
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="applications" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) event.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: '완료',
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="completed" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) event.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="stamps"
        options={{
          title: '스탬프',
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="stamps" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) event.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: '마이',
          tabBarItemStyle: hasSession ? undefined : { opacity: 0.32 },
          tabBarIcon: (props) => <TabIcon name="my" {...props} />,
        }}
        listeners={{
          tabPress: (event) => {
            if (!hasSession) event.preventDefault();
          },
        }}
      />
    </Tabs>
  );
}
