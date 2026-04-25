import { View, Text } from 'react-native';
import { authStyles as s } from './styles';

interface AuthHeaderProps {
  appName: string;
  icon?: React.ReactNode;
  logo?: React.ReactNode;
  subtitle?: string;
}

export function AuthHeader({ appName, icon, logo, subtitle }: AuthHeaderProps) {
  return (
    <View style={s.headerContainer}>
      {logo ? (
        <View style={{ marginBottom: 16 }}>
          {logo}
        </View>
      ) : (
        <View style={s.logoCircle}>
          {icon ?? (
            <Text style={s.logoFallback}>
              {appName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      )}
      <Text style={s.title}>OnSite {appName}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
