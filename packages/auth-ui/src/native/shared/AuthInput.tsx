import { useState } from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { authStyles as s } from './styles';

interface AuthInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon?: React.ReactNode;
}

export function AuthInput({ label, icon, ...inputProps }: AuthInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={s.inputGroup}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputRow, focused && s.inputRowFocused]}>
        {icon ? <View style={s.inputIcon}>{icon}</View> : null}
        <TextInput
          style={s.input}
          placeholderTextColor="#9CA3AF"
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />
      </View>
    </View>
  );
}
