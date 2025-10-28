import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Audio } from 'expo-audio';
import { AudioManager } from 'react-native-audio-api';

export default function App() {
  const recordingRef = useRef(null);
  const [hasMicPermission, setHasMicPermission] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [uri, setUri] = useState(null);
  const [error, setError] = useState(null);

  // Configure iOS audio session to mirror Swift version
  const configureAudioSession = useCallback(async () => {
    try {
      await AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'default',
        iosOptions: ['mixWithOthers', 'allowBluetoothA2DP', 'defaultToSpeaker'],
      });
      await AudioManager.setAudioSessionActivity(true);
    } catch (e) {
      // Fallback to expo-audio config if needed
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (inner) {
        // bubble up the original error for visibility
        throw e;
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasMicPermission(status === 'granted');
      try {
        await configureAudioSession();
      } catch (e) {
        setError(String(e?.message || e));
      }
    })();
  }, [configureAudioSession]);

  const startRecording = useCallback(async () => {
    setError(null);
    setUri(null);
    try {
      await configureAudioSession();

      const recording = new Audio.Recording();
      // Use Expo's built-in high-quality preset (AAC on iOS)
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);

      // Poll duration for simple UI feedback
      const interval = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          setDurationMs(status.durationMillis || 0);
          if (!status.isRecording) {
            clearInterval(interval);
          }
        } catch (_) {
          clearInterval(interval);
        }
      }, 300);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }, [configureAudioSession]);

  const stopRecording = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const localUri = recording.getURI();
      setUri(localUri || null);
      recordingRef.current = null;
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setIsRecording(false);
    }
  }, []);

  const durationText = useMemo(() => {
    const s = Math.floor((durationMs || 0) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [durationMs]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sample Record (Expo)</Text>
        <Text style={styles.subtitle}>
          Background-safe recording. Does not duck other audio. AirPods stay A2DP.
        </Text>

        {hasMicPermission === false && (
          <Text style={styles.error}>Microphone permission is required.</Text>
        )}
        {error && <Text style={styles.error}>Error: {error}</Text>}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={styles.statusValue}>{isRecording ? 'Recording' : 'Idle'}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Duration:</Text>
          <Text style={styles.statusValue}>{durationText}</Text>
        </View>
        {uri && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>File:</Text>
            <Text style={styles.uri} numberOfLines={1}>{uri}</Text>
          </View>
        )}

        <View style={styles.buttons}>
          {!isRecording ? (
            <Pressable style={[styles.button, styles.primary]} onPress={startRecording}>
              <Text style={styles.buttonText}>Start Recording</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.button, styles.danger]} onPress={stopRecording}>
              <Text style={styles.buttonText}>Stop</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.notes}>
          <Text style={styles.noteTitle}>Notes</Text>
          <Text style={styles.noteText}>- Uses react-native-audio-api to set iOS session to playAndRecord with mixWithOthers, allowBluetoothA2DP, defaultToSpeaker.</Text>
          <Text style={styles.noteText}>- Recording uses expo-audio. For native module support, use Expo Dev Build.</Text>
          <Text style={styles.noteText}>- Info.plist includes UIBackgroundModes: audio and microphone permission.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#555' },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusLabel: { color: '#333', fontWeight: '600' },
  statusValue: { color: '#333' },
  uri: { flex: 1, color: '#333' },
  buttons: { marginTop: 12, flexDirection: 'row', gap: 12 },
  button: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  primary: { backgroundColor: '#2f80ed' },
  danger: { backgroundColor: '#eb5757' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#d00' },
  notes: { marginTop: 24, gap: 6 },
  noteTitle: { fontWeight: '700' },
  noteText: { color: '#444' },
});
