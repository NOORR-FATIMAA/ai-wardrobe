import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useState, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { useTheme } from '@/lib/theme';

/**
 * Shares the referenced view (an outfit's title and board) as a PNG through the system share sheet.
 * The image is made on the device and only goes where the user sends it. Hidden on the web, where
 * local files cannot be shared.
 */
export function ShareOutfitButton({
  target,
  title,
}: {
  target: RefObject<ComponentRef<typeof View> | null>;
  title: string;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  if (Platform.OS === 'web') return null;

  async function share() {
    setBusy(true);
    let uri: string | null = null;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device has no app that can receive a shared image.');
        return;
      }
      uri = await captureRef(target, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Share “${title}”` });
    } catch {
      Alert.alert('Could not share', 'The outfit image could not be created. Please try again.');
    } finally {
      // The share sheet has finished with the file once shareAsync resolves.
      if (uri) releaseCapture(uri);
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={share}
      disabled={busy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Share outfit as an image"
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="share-outline" size={22} color={colors.accent} />}
    </Pressable>
  );
}
