import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ApplicationsProvider } from '@/src/state/ApplicationsContext';
import { ChildProfilesProvider } from '@/src/state/ChildProfilesContext';
import { ClassesProvider } from '@/src/state/ClassesContext';
import { CompletedRecordsProvider } from '@/src/state/CompletedRecordsContext';

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <ChildProfilesProvider>
      <ClassesProvider>
        <ApplicationsProvider>
          <CompletedRecordsProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                gestureEnabled: false,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="signup" />
              <Stack.Screen name="reset-password" />
              <Stack.Screen name="(tabs)" />
            </Stack>
            <StatusBar style="dark" />
          </CompletedRecordsProvider>
        </ApplicationsProvider>
      </ClassesProvider>
    </ChildProfilesProvider>
  );
}
