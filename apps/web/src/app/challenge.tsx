import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

import { ChallengeScreen } from '@/components/ChallengeScreen';

export default function Challenge() {
  if (Platform.OS === 'web') return <Redirect href="/" />;
  return <ChallengeScreen />;
}
