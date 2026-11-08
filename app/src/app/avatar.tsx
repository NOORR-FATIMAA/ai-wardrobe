import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Body, Card, Heading, Muted, Screen } from '@/components/ui';
import { space, useTheme } from '@/lib/theme';

const ROADMAP = [
  {
    icon: 'images-outline',
    title: 'Outfit previews',
    text: 'Flat-lay collages of each recommended outfit made from your own photos.',
  },
  {
    icon: 'body-outline',
    title: 'Body-shape avatar',
    text: 'An approximate 3D figure from your height, build and optional measurements, with separate consent for any body photos.',
  },
  {
    icon: 'shirt-outline',
    title: 'Virtual try-on',
    text: 'AI images of outfits on your avatar. These are for visualising style only, not exact fit.',
  },
] as const;

/** Placeholder for the avatar and try-on features. See docs/AVATAR_TRYON_FEASIBILITY.md. */
export default function Avatar() {
  const { colors } = useTheme();
  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="body-outline" size={48} color={colors.accent} />
        </View>
        <Heading style={{ textAlign: 'center' }}>Your avatar is on the way</Heading>
        <Muted style={{ textAlign: 'center' }}>
          We’re building this step by step and want it to be honest about what AI can and can’t show.
        </Muted>
      </View>
      {ROADMAP.map((r) => (
        <Card key={r.title} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name={r.icon} size={22} color={colors.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Body style={{ fontWeight: '600' }}>{r.title}</Body>
            <Muted>{r.text}</Muted>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
