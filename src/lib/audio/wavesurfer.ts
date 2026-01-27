import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

export interface WaveSurferOptions {
  container: HTMLElement;
  waveColor?: string;
  progressColor?: string;
  height?: number;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
}

const defaultOptions: Partial<WaveSurferOptions> = {
  waveColor: '#4a9eff',
  progressColor: '#2563eb',
  height: 80,
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
};

export function createWaveSurfer(options: WaveSurferOptions): WaveSurfer {
  return WaveSurfer.create({
    ...defaultOptions,
    ...options,
  });
}

export function createRecorder(wavesurfer: WaveSurfer) {
  return wavesurfer.registerPlugin(RecordPlugin.create({
    scrollingWaveform: false,
    renderRecordedAudio: true,
  }));
}

export { WaveSurfer, RecordPlugin };
