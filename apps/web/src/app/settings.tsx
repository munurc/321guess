import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

import { SettingsScreen } from '@/components/SettingsScreen';

export default function Settings() {
  if (Platform.OS === 'web') return <Redirect href="/" />;
  return <SettingsScreen />;
}
