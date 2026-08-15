import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BatchSummary from './BatchSummary.svelte';

const BASE = {
  modelId: '0.6b-base',
  modelLabel: '0.6B Base',
  language: 'English',
  format: 'wav',
  sampleRate: null,
  bitDepth: 16,
  seed: null,
};

describe('BatchSummary', () => {
  it('names the model, format and language every batch will use', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden' } });

    expect(screen.getByText(/0\.6B Base/)).toBeTruthy();
    expect(screen.getByText(/English/)).toBeTruthy();
    expect(screen.getByText(/WAV/i)).toBeTruthy();
  });

  it('shows the reference clip for voice clone', () => {
    render(BatchSummary, {
      props: { ...BASE, mode: 'voice-clone', referenceAudioName: 'sample.wav' },
    });

    expect(screen.getByText(/sample\.wav/)).toBeTruthy();
  });

  it('warns when voice clone has no reference audio, before the batch is started', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'voice-clone', referenceAudioName: null } });

    // Two elements mention reference audio here — the summary row and the
    // warning — so getByText(/reference audio/i) would throw "Found multiple
    // elements". Assert each specifically.
    expect(screen.getByText('Add reference audio above before starting the batch.')).toBeTruthy();
    expect(screen.getByText('No reference audio selected')).toBeTruthy();
  });

  it('reports a random seed when none is pinned', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden', seed: null } });

    expect(screen.getByText(/random/i)).toBeTruthy();
  });

  it('reports a pinned seed value', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden', seed: 42 } });

    expect(screen.getByText(/42/)).toBeTruthy();
  });

  it('says instructions are ignored on the 0.6B model that discards them', () => {
    render(BatchSummary, {
      props: {
        ...BASE,
        modelId: '0.6b',
        modelLabel: '0.6B Custom',
        mode: 'custom-voice',
        speaker: 'aiden',
        instruction: 'speak slowly',
      },
    });

    expect(screen.getByText(/ignore/i)).toBeTruthy();
  });

  it('does not claim instructions are ignored on 1.7B Custom', () => {
    render(BatchSummary, {
      props: {
        ...BASE,
        modelId: '1.7b',
        modelLabel: '1.7B Custom',
        mode: 'custom-voice',
        speaker: 'aiden',
        instruction: 'speak slowly',
      },
    });

    expect(screen.queryByText(/ignore/i)).toBeNull();
  });

  it('shows the voice description for voice design', () => {
    render(BatchSummary, {
      props: {
        ...BASE,
        modelId: '1.7b-design',
        modelLabel: '1.7B Design',
        mode: 'voice-design',
        voiceDescription: 'A calm narrator',
      },
    });

    expect(screen.getByText('A calm narrator')).toBeTruthy();
  });

  it('reports the mp3 bitrate when exporting mp3', () => {
    render(BatchSummary, {
      props: { ...BASE, mode: 'custom-voice', speaker: 'aiden', format: 'mp3' },
    });

    expect(screen.getByText(/192 kbps/i)).toBeTruthy();
  });
});
