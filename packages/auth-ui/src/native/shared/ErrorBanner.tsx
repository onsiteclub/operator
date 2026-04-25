import { View, Text } from 'react-native';
import { authStyles as s } from './styles';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.errorBanner}>
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.successBanner}>
      <Text style={s.successText}>{message}</Text>
    </View>
  );
}
