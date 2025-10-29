import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { AudioManager, AudioRecorder, AudioContext } from 'react-native-audio-api';
import { File, Directory, Paths } from 'expo-file-system';

function formatMillis(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const SAMPLE_RATE = 16000;     // 低負荷
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;    // PCM16

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastUri, setLastUri] = useState(null);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const startedAtRef = useRef(null);
  const timerRef = useRef(null);
  const pcmChunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const playSourceRef = useRef(null);

  // ---- iOS: 非ダック & A2DP維持のセッションを1回だけ設定 ----
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'ios') {
        await AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'default',
          iosOptions: ['mixWithOthers', 'allowBluetoothA2DP', 'defaultToSpeaker'],
        });
        await AudioManager.setAudioSessionActivity(true);
        AudioManager.observeAudioInterruptions(true);
      }
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { playSourceRef.current?.stop?.(0); } catch {}
      playSourceRef.current = null;
      try { audioCtxRef.current?.close?.(); } catch {}
      audioCtxRef.current = null;
    };
  }, []);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 1000);
  };
  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };

  // ---- 録音開始 ----
  const onStart = useCallback(async () => {
    try {
      setError(null);
      pcmChunksRef.current = [];
      setLastUri(null);

      const rec = new AudioRecorder({
        sampleRate: SAMPLE_RATE,
        bufferLengthInSamples: SAMPLE_RATE, // 1秒単位でコール（低オーバーヘッド）
      });

      rec.onAudioReady(({ buffer }) => {
        const ch0 = buffer.getChannelData(0);         // Float32Array
        pcmChunksRef.current.push(float32ToPCM16(ch0)); // Int16Array
      });

      recorderRef.current = rec;
      await rec.start();
      setIsRecording(true);
      startTimer();
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  }, []);

  // ---- 停止→WAV保存 ----
  const onStop = useCallback(async () => {
    try {
      if (!recorderRef.current) return;
      setIsRecording(false);
      stopTimer();

      await recorderRef.current.stop();
      recorderRef.current = null;

      // 停止時だけWAV化して保存（録音中は変換のみ）
      const wavBytes = buildWavFromChunks(pcmChunksRef.current, SAMPLE_RATE, CHANNELS);
      if (!(wavBytes instanceof Uint8Array)) {
        throw new Error('WAVバイト列の生成に失敗しました（Uint8Arrayではありません）');
      }
      pcmChunksRef.current = [];

      // 新API: File/Directory を使って生バイトを書き込む
      const recordingsDir = new Directory(Paths.document, 'recordings');
      try { if (!recordingsDir.exists) recordingsDir.create(); } catch {}
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File(recordingsDir, `rec-${stamp}.wav`);
      if (file.exists) file.delete();
      file.create();
      file.write(wavBytes);
      setLastUri(file.uri);
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  }, []);

  const onToggleRecord = useCallback(() => { isRecording ? onStop() : onStart(); }, [isRecording, onStart, onStop]);

  // ---- 再生 ----
  const onPlay = useCallback(async () => {
    if (!lastUri) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;

      // 既存の再生を停止
      if (playSourceRef.current) {
        try { playSourceRef.current.stop(0); } catch {}
        try { playSourceRef.current.disconnect(ctx.destination); } catch {}
        playSourceRef.current = null;
      }

      // ファイルからデコードして再生
      const buffer = await ctx.decodeAudioDataSource(lastUri);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onEnded = () => { playSourceRef.current = null; };
      playSourceRef.current = source;
      source.start(0);
    } catch (e) {
      Alert.alert('再生エラー', String(e?.message ?? e));
    }
  }, [lastUri]);

  const onDelete = useCallback(async () => {
    if (!lastUri) return;
    new File(lastUri).delete();
    setLastUri(null);
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
            <Text style={styles.smallBtnText}>再生</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} disabled={!lastUri} style={[styles.smallBtn, styles.danger, !lastUri && styles.buttonDisabled]}>
            <Text style={styles.smallBtnText}>削除</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          ・バックグラウンド継続（UIBackgroundModes: audio）{'\n'}
          ・YouTube等を下げない（mixWithOthers）{'\n'}
          ・AirPods音質維持（allowBluetoothA2DP / 内蔵マイク入力）
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ---------- Utility ----------
function float32ToPCM16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function buildWavFromChunks(chunks, sampleRate, channels) {
  const dataBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const header = buildWavHeader(sampleRate, channels, dataBytes);
  const out = new Uint8Array(header.length + dataBytes);
  out.set(header, 0);
  let offset = header.length;
  for (const c of chunks) {
    out.set(new Uint8Array(c.buffer), offset);
    offset += c.byteLength;
  }
  return out;
}

function buildWavHeader(sampleRate, channels, dataBytes) {
  const blockAlign = channels * BYTES_PER_SAMPLE;
  const byteRate = sampleRate * blockAlign;
  const ab = new ArrayBuffer(44);
  const dv = new DataView(ab);

  writeStr(dv, 0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  writeStr(dv, 8, 'WAVE');
  writeStr(dv, 12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 8 * BYTES_PER_SAMPLE, true);
  writeStr(dv, 36, 'data');
  dv.setUint32(40, dataBytes, true);

  return new Uint8Array(ab);
}

function writeStr(dv, offset, s) { for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i)); }

// Base64 変換は不要になったため削除

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
