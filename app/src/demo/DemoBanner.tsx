// Shown at the top of every screen reachable in demo mode, so sample data is never mistaken for real data.
import { Text, View } from 'react-native';
import { Button, Muted } from '../components/ui';
import { useAppData } from '../lib/data';
import { radius, space, useTheme } from '../lib/theme';

export function DemoBanner() {
  const { colors } = useTheme();
  const { demoActive, exitDemo } = useAppData();
  if (!demoActive) return null;
  return (
    <View
      accessibilityRole="summary"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.accentSoft }}
    >
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accent }}>
        <Text style={{ color: colors.onAccent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>DEMO</Text>
      </View>
      <Muted style={{ flex: 1, color: colors.text }}>Sample data on this device only. Nothing is saved or sent.</Muted>
      <Button variant="ghost" title="Exit demo" onPress={exitDemo} style={{ paddingHorizontal: space.sm, minHeight: 36 }} />
    </View>
  );
}

/** Replaces an action that needs a real account (writes data or calls the backend) while in demo mode. */
export function DemoOnlyNote({ what }: { what: string }) {
  return <Muted>{what} need a real account, so they are not available in demo mode.</Muted>;
}
