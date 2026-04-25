import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, type TextInputProps } from 'react-native';
import { authStyles as s } from './styles';

interface PasswordInputProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label?: string;
  icon?: React.ReactNode;
  eyeOpen?: React.ReactNode;
  eyeClosed?: React.ReactNode;
}

export function PasswordInput({
  label = 'Password',
  icon,
  eyeOpen,
  eyeClosed,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={s.inputGroup}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputRow, focused && s.inputRowFocused]}>
        {icon ? <View style={s.inputIcon}>{icon}</View> : null}
        <TextInput
          style={s.input}
          secureTextEntry={!visible}
          placeholderTextColor="#9CA3AF"
          autoComplete="password"
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
        <TouchableOpacity
          onPress={() => setVisible(!visible)}
          style={s.eyeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {visible
            ? (eyeClosed ?? <Text style={s.eyeText}>Hide</Text>)
            : (eyeOpen ?? <Text style={s.eyeText}>Show</Text>)}
        </TouchableOpacity>
      </View>
    </View>
  );
}
