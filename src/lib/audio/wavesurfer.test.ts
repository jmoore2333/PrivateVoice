import { describe, it, expect } from 'vitest';
import { createWaveSurfer, WaveSurfer } from './wavesurfer';

describe('wavesurfer wrapper', () => {
  it('exports WaveSurfer class', () => {
    expect(WaveSurfer).toBeDefined();
  });

  it('createWaveSurfer is a function', () => {
    expect(typeof createWaveSurfer).toBe('function');
  });
});
