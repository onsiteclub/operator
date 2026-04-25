import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { colors } from '@onsite/tokens';
import { authStyles as s } from './styles';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function AuthButton({ title, onPress, loading, disabled }: AuthButtonProps) {
  return (
    <TouchableOpacity
      style={[s.button, (loading || disabled) && s.buttonDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={s.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
