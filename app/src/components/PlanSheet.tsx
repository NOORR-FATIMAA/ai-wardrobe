import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayLabel, nextDays } from '@/lib/dates';
import { radius, space, useTheme } from '@/lib/theme';
import { Button, Chip, Heading, Muted } from './ui';

/** Bottom sheet for choosing which day (next two weeks) to wear an outfit. */
export function PlanSheet({
  visible,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  onPick: (date: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + space.lg }]}>
        <Heading>Plan this outfit</Heading>
        <Muted>Pick a day. It will show up in your outfit calendar.</Muted>
        <View style={styles.days}>
          {nextDays(14).map((d) => (
            <Chip key={d} label={dayLabel(d)} selected={current === d} onPress={() => onPick(d)} />
          ))}
        </View>
        {current ? <Button variant="danger" title="Remove from calendar" onPress={() => onPick(null)} /> : null}
        <Button variant="ghost" title="Cancel" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
