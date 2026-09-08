import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

import { ScoresScreen } from '@/components/ScoresScreen';

export default function Scores() {
  if (Platform.OS === 'web') return <Redirect href="/" />;
  return <ScoresScreen />;
}
