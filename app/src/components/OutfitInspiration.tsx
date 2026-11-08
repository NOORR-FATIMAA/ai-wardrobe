import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { radius, space, useTheme } from '@/lib/theme';
import type { InspirationPhoto } from '@/lib/types';
import { Button, Muted } from './ui';

const PHOTO_WIDTH = 132;
const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=wardrobe_ai&utm_medium=referral';

/** Pinterest's own search page for the phrase (opens Pinterest; nothing is fetched by the app). */
export const pinterestSearchUrl = (query: string) =>
  `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;

/**
 * "Looks like this": photos matching the stylist's search phrase for an outfit, loaded only when
 * asked for (the photo service has an hourly limit), each credited to its photographer, plus a
 * link to the same search on Pinterest.
 */
export function OutfitInspiration({ query }: { query: string }) {
  const { colors } = useTheme();
  const { demoActive } = useAppData();
  const [photos, setPhotos] = useState<InspirationPhoto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPhotos((await api.inspiration(query)).photos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <View style={{ gap: space.sm }}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Inspiration · “{query}”</Text>

      {photos?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {photos.map((p) => (
            <View key={p.id} style={{ width: PHOTO_WIDTH, gap: 4 }}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${p.alt}. Photo by ${p.photographer} on Unsplash`}
                onPress={() => open(p.photo_url)}
              >
                <Image
                  source={{ uri: p.image_url }}
                  alt={p.alt}
                  style={[
                    styles.photo,
                    { aspectRatio: Math.max(0.6, Math.min(1, p.width / p.height)), backgroundColor: p.color ?? colors.surfaceAlt },
                  ]}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
              <Text numberOfLines={1} style={[styles.credit, { color: colors.textMuted }]}>
                by{' '}
                <Text style={{ color: colors.text, textDecorationLine: 'underline' }} onPress={() => open(p.photographer_url)}>
                  {p.photographer}
                </Text>
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {photos?.length ? (
        <Text style={[styles.credit, { color: colors.textMuted }]}>
          Photos from{' '}
          <Text style={{ color: colors.text, textDecorationLine: 'underline' }} onPress={() => open(UNSPLASH_HOME)}>
            Unsplash
          </Text>
        </Text>
      ) : null}
      {photos && !photos.length ? <Muted>No photos found for this look.</Muted> : null}
      {error ? <Muted>{error}</Muted> : null}

      <View style={styles.row}>
        {!demoActive && !photos ? (
          <Button title="See looks like this" icon="images-outline" variant="secondary" loading={loading} onPress={load} />
        ) : null}
        <Button title="Ideas on Pinterest" icon="logo-pinterest" variant="ghost" onPress={() => open(pinterestSearchUrl(query))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  photo: { width: PHOTO_WIDTH, borderRadius: radius.sm },
  credit: { fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
