import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import Sound from 'react-native-nitro-sound';
import { File } from 'expo-file-system';

function formatMillis(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastUri, setLastUri] = useState(null);
  const [error, setError] = useState(null);

  const isPlayingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Best-effort cleanup; ignore errors
      Sound.stopRecorder().catch(() => {});
      Sound.stopPlayer().catch(() => {});
      try { Sound.removeRecordBackListener(); } catch {}
      try { Sound.removePlayBackListener(); } catch {}
      try { Sound.removePlaybackEndListener(); } catch {}
    };
  }, []);

  // ---- 録音開始 ----
  const onStart = useCallback(async () => {
    try {
      setError(null);
      setLastUri(null);

      // Record progress
      Sound.addRecordBackListener((e) => {
        setElapsed(Math.floor(e.currentPosition));
      });

      await Sound.startRecorder();
      setIsRecording(true);
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  }, []);

  // ---- 停止 ----
  const onStop = useCallback(async () => {
    try {
      setIsRecording(false);
      const result = await Sound.stopRecorder();
      Sound.removeRecordBackListener();
      setLastUri(result);
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  }, []);

  const onToggleRecord = useCallback(() => {
    isRecording ? onStop() : onStart();
  }, [isRecording, onStart, onStop]);

  // ---- 再生 ----
  const onPlay = useCallback(async () => {
    if (!lastUri) return;
    try {
      // Playback progress/end
      Sound.addPlayBackListener((e) => {
        setElapsed(Math.floor(e.currentPosition));
      });
      Sound.addPlaybackEndListener(() => {
        isPlayingRef.current = false;
      });

      await Sound.startPlayer(lastUri);
      isPlayingRef.current = true;
    } catch (e) {
      Alert.alert('再生エラー', String(e?.message ?? e));
    }
  }, [lastUri]);

  const onDelete = useCallback(async () => {
    if (!lastUri) return;
    try {
      new File(lastUri).delete();
      setLastUri(null);
    } catch (e) {
      // ignore
    }
  }, [lastUri]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>背景録音（非ダック / A2DP維持）</Text>
        <Text style={styles.subtitle}>{error ? `エラー: ${error}` : '準備OK'}</Text>

        <View style={styles.timerRow}>
          <Text style={styles.timer}>{formatMillis(elapsed)}</Text>
          <Text style={[styles.dot, isRecording && styles.dotOn]}>●</Text>
        </View>

        <TouchableOpacity onPress={onToggleRecord} style={[styles.button, isRecording ? styles.stop : styles.record]}>
          <Text style={styles.buttonText}>{isRecording ? '停止して保存' : '録音開始'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>最新の録音</Text>
        <Text style={styles.path} numberOfLines={2}>{lastUri ?? '（まだありません）'}</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={onPlay} disabled={!lastUri} style={[styles.smallBtn, !lastUri && styles.buttonDisabled]}>
            <Text style={styles.smallBtnText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} disabled={!lastUri} style={[styles.smallBtn, styles.danger, !lastUri && styles.buttonDisabled]}>
            <Text style={styles.smallBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          ・バックグラウンド継続（UIBackgroundModes: audio）{"\n"}
          ・YouTube等を下げない（mixWithOthers）{"\n"}
          ・AirPods音質維持（allowBluetoothA2DP / 内蔵マイク入力）
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0c', padding: 16, gap: 16 },
  card: { backgroundColor: '#16171a', borderRadius: 12, padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  subtitle: { color: '#9aa0a6', marginTop: 4 },
  timerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  timer: { color: '#fff', fontSize: 40, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  dot: { marginLeft: 8, color: '#444', fontSize: 18 },
  dotOn: { color: '#e74c3c' },
  button: { marginTop: 16, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  record: { backgroundColor: '#2563eb' },
  stop: { backgroundColor: '#dc2626' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  smallBtn: { backgroundColor: '#2d2f33', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  smallBtnText: { color: '#fff', fontSize: 14 },
  danger: { backgroundColor: '#7f1d1d' },
  path: { color: '#aab0b6', marginTop: 6 },
  note: { color: '#6b7280', marginTop: 10, fontSize: 12 },
});

