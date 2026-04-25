/**
 * SelectInput — Simple dropdown-like selector for React Native.
 *
 * Uses a modal with a list of options (no native Picker dependency).
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable } from 'react-native';
import { authStyles as s } from './styles';
import { colors, borderRadius, spacing } from '@onsite/tokens';

interface SelectInputProps {
  label: string;
  options: Array<{ id: string; name: string }>;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SelectInput({ label, options, value, onValueChange, disabled }: SelectInputProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <View style={s.inputGroup}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity
        style={s.inputRow}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text
          style={[
            s.input,
            { textAlignVertical: 'center', lineHeight: 48 },
            !selected?.name || value === '' ? { color: '#9CA3AF' } : {},
          ]}
          numberOfLines={1}
        >
          {selected?.name && value !== '' ? selected.name : 'Select...'}
        </Text>
        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>▼</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 }}
          onPress={() => setOpen(false)}
        >
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            maxHeight: 300,
            overflow: 'hidden',
          }}>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onValueChange(item.id); setOpen(false); }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.cardBorder,
                    backgroundColor: item.id === value ? colors.background : 'transparent',
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    color: item.id === '' ? '#9CA3AF' : colors.text,
                    fontWeight: item.id === value ? '600' : '400',
                  }}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
