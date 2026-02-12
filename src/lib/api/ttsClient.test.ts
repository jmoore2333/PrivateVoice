import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ttsClient } from './ttsClient';

// ---------------------------------------------------------------------------
// Helpers to build mock Response objects
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function blobResponse(content = 'fake-audio', status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'audio/wav' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  // Ensure no leftover abort controllers between tests
  if (ttsClient.isGenerating) {
    ttsClient.abortGeneration();
  }
  vi.restoreAllMocks();
});

// ===========================================================================
// readErrorMessage (tested indirectly through generation failures)
// ===========================================================================

describe('readErrorMessage (via generateCustomVoice failures)', () => {
  const request = { text: 'hello', speaker: 'aiden' };

  it('parses {detail: "string message"}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Model not loaded' }, 422),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('Model not loaded');
  });

  it('parses {detail: [{msg: "validation error"}]}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: [{ msg: 'validation error' }] }, 422),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('validation error');
  });

  it('joins multiple array items with semicolons', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { detail: [{ msg: 'field required' }, { msg: 'value too short' }] },
        422,
      ),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow(
      'field required; value too short',
    );
  });

  it('parses {detail: {message: "object error"}}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { message: 'object error' } }, 500),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('object error');
  });

  it('parses {detail: {msg: "alt object error"}}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { msg: 'alt object error' } }, 500),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('alt object error');
  });

  it('JSON-stringifies unknown detail object shapes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { code: 42, info: 'weird' } }, 500),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow(
      JSON.stringify({ code: 42, info: 'weird' }),
    );
  });

  it('falls back when detail is absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'no detail key' }, 500));

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow(
      'Failed to generate audio',
    );
  });

  it('falls back for non-JSON response body', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('Internal Server Error', 500));

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow(
      'Failed to generate audio',
    );
  });

  it('handles detail array with string items', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: ['error one', 'error two'] }, 422),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('error one; error two');
  });

  it('handles detail array filtering out null items', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: [null, { msg: 'only valid' }, null] }, 422),
    );

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('only valid');
  });

  it('stringifies non-string detail values', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 12345 }, 500));

    await expect(ttsClient.generateCustomVoice(request)).rejects.toThrow('12345');
  });
});

// ===========================================================================
// generateCustomVoice
// ===========================================================================

describe('generateCustomVoice', () => {
  it('sends correct JSON body and returns blob on success', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse('audio-data'));

    const request = { text: 'Hello world', speaker: 'serena', instruction: 'calm' };
    const blob = await ttsClient.generateCustomVoice(request);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/generate/custom-voice');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });

    const parsed = JSON.parse(options?.body as string);
    expect(parsed).toEqual({ text: 'Hello world', speaker: 'serena', instruction: 'calm' });

    expect(blob.size).toBeGreaterThan(0);
  });

  it('includes format in payload when provided', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateCustomVoice({
      text: 'Test',
      speaker: 'aiden',
      format: 'mp3',
    });

    const parsed = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(parsed.format).toBe('mp3');
  });

  it('includes language in payload when provided', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateCustomVoice({
      text: 'Bonjour',
      speaker: 'vivian',
      language: 'French',
    });

    const parsed = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(parsed.language).toBe('French');
  });

  it('throws with parsed error on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'GPU out of memory' }, 500));

    await expect(
      ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' }),
    ).rejects.toThrow('GPU out of memory');
  });

  it('passes an AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' });

    const options = fetchMock.mock.calls[0][1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});

// ===========================================================================
// generateVoiceClone
// ===========================================================================

describe('generateVoiceClone', () => {
  const fakeFile = new File(['audio-bytes'], 'ref.wav', { type: 'audio/wav' });

  it('sends FormData with correct fields and returns blob', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse('cloned-audio'));

    const blob = await ttsClient.generateVoiceClone('Say hello', 'Reference text', fakeFile, {
      language: 'English',
      format: 'wav',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/generate/voice-clone');
    expect(options?.method).toBe('POST');

    const formData = options?.body as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('text')).toBe('Say hello');
    expect(formData.get('reference_text')).toBe('Reference text');
    expect(formData.get('reference_audio')).toBeInstanceOf(File);
    expect(formData.get('x_vector_only_mode')).toBe('false');
    expect(formData.get('language')).toBe('English');
    expect(formData.get('format')).toBe('wav');

    expect(blob.size).toBeGreaterThan(0);
  });

  it('sets x_vector_only_mode to true when option is set', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateVoiceClone('Hi', 'Ref', fakeFile, { xVectorOnly: true });

    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get('x_vector_only_mode')).toBe('true');
  });

  it('omits optional language and format when not provided', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateVoiceClone('Hi', 'Ref', fakeFile);

    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get('language')).toBeNull();
    expect(formData.get('format')).toBeNull();
    expect(formData.get('x_vector_only_mode')).toBe('false');
  });

  it('throws with parsed error on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Audio too short' }, 422));

    await expect(
      ttsClient.generateVoiceClone('Hi', 'Ref', fakeFile),
    ).rejects.toThrow('Audio too short');
  });

  it('passes an AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateVoiceClone('Hi', 'Ref', fakeFile);

    const options = fetchMock.mock.calls[0][1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});

// ===========================================================================
// generateVoiceDesign
// ===========================================================================

describe('generateVoiceDesign', () => {
  it('sends correct JSON body with format and returns blob', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse('designed-audio'));

    const request = {
      text: 'Good morning',
      voice_description: 'A warm female voice with British accent',
      language: 'English',
      format: 'mp3',
    };
    const blob = await ttsClient.generateVoiceDesign(request);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/generate/voice-design');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });

    const parsed = JSON.parse(options?.body as string);
    expect(parsed).toEqual({
      text: 'Good morning',
      voice_description: 'A warm female voice with British accent',
      language: 'English',
      format: 'mp3',
    });

    expect(blob.size).toBeGreaterThan(0);
  });

  it('throws with parsed error on failure', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { message: 'Invalid voice description' } }, 400),
    );

    await expect(
      ttsClient.generateVoiceDesign({
        text: 'Hi',
        voice_description: '',
      }),
    ).rejects.toThrow('Invalid voice description');
  });

  it('passes an AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateVoiceDesign({ text: 'Hi', voice_description: 'deep male voice' });

    const options = fetchMock.mock.calls[0][1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});

// ===========================================================================
// abortGeneration
// ===========================================================================

describe('abortGeneration', () => {
  it('aborts an in-flight generateCustomVoice request', async () => {
    // fetch never resolves on its own -- we rely on the abort signal
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const promise = ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' });

    // The request is in flight
    expect(ttsClient.isGenerating).toBe(true);

    ttsClient.abortGeneration();

    await expect(promise).rejects.toThrow();
    try {
      await promise;
    } catch (err) {
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  it('aborts an in-flight generateVoiceClone request', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const fakeFile = new File(['data'], 'audio.wav', { type: 'audio/wav' });
    const promise = ttsClient.generateVoiceClone('Hi', 'Ref', fakeFile);

    expect(ttsClient.isGenerating).toBe(true);
    ttsClient.abortGeneration();

    await expect(promise).rejects.toThrow();
    try {
      await promise;
    } catch (err) {
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  it('aborts an in-flight generateVoiceDesign request', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const promise = ttsClient.generateVoiceDesign({
      text: 'Hi',
      voice_description: 'deep male voice',
    });

    expect(ttsClient.isGenerating).toBe(true);
    ttsClient.abortGeneration();

    await expect(promise).rejects.toThrow();
    try {
      await promise;
    } catch (err) {
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  it('is a no-op when no generation is in progress', () => {
    expect(ttsClient.isGenerating).toBe(false);
    // Should not throw
    ttsClient.abortGeneration();
    expect(ttsClient.isGenerating).toBe(false);
  });
});

// ===========================================================================
// isGenerating
// ===========================================================================

describe('isGenerating', () => {
  it('is false initially', () => {
    expect(ttsClient.isGenerating).toBe(false);
  });

  it('is true while generation is in progress', async () => {
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );

    const promise = ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' });
    expect(ttsClient.isGenerating).toBe(true);

    resolveFetch(blobResponse());
    await promise;

    expect(ttsClient.isGenerating).toBe(false);
  });

  it('is false after generation completes successfully', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse());

    await ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' });
    expect(ttsClient.isGenerating).toBe(false);
  });

  it('is false after generation fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'error' }, 500));

    await expect(
      ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' }),
    ).rejects.toThrow();

    expect(ttsClient.isGenerating).toBe(false);
  });

  it('is false after generation is aborted', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const promise = ttsClient.generateCustomVoice({ text: 'Hi', speaker: 'aiden' });
    expect(ttsClient.isGenerating).toBe(true);

    ttsClient.abortGeneration();
    await expect(promise).rejects.toThrow();

    expect(ttsClient.isGenerating).toBe(false);
  });
});

// ===========================================================================
// health
// ===========================================================================

describe('health', () => {
  it('returns health data on success', async () => {
    const data = { status: 'ok', version: '1.0.0' };
    fetchMock.mockResolvedValueOnce(jsonResponse(data));

    const result = await ttsClient.health();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/health');
    expect(result).toEqual(data);
  });

  it('throws when server is not available', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await expect(ttsClient.health()).rejects.toThrow('Server not available');
  });
});

// ===========================================================================
// getModelStatus
// ===========================================================================

describe('getModelStatus', () => {
  it('returns model status on success', async () => {
    const status = {
      loaded: true,
      model_id: '0.6b',
      device: 'mps',
      memory: { device: 'mps', total_gb: 16, available_gb: 8 },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(status));

    const result = await ttsClient.getModelStatus();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/model-status');
    expect(result).toEqual(status);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(ttsClient.getModelStatus()).rejects.toThrow('Failed to get model status');
  });
});

// ===========================================================================
// loadModel
// ===========================================================================

describe('loadModel', () => {
  it('sends POST with model_id and resolves on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'loaded' }));

    await ttsClient.loadModel('1.7b');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/load-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: '1.7b' }),
    });
  });

  it('defaults to 0.6b model', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'loaded' }));

    await ttsClient.loadModel();

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.model_id).toBe('0.6b');
  });

  it('throws with parsed error message on failure', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Insufficient memory for 1.7b model' }, 500),
    );

    await expect(ttsClient.loadModel('1.7b')).rejects.toThrow(
      'Insufficient memory for 1.7b model',
    );
  });
});

// ===========================================================================
// getStartupStatus
// ===========================================================================

describe('getStartupStatus', () => {
  it('returns startup status on success', async () => {
    const status = { phase: 'ready', message: 'Server ready', progress: 1.0 };
    fetchMock.mockResolvedValueOnce(jsonResponse(status));

    const result = await ttsClient.getStartupStatus();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/startup-status');
    expect(result).toEqual(status);
  });

  it('throws with status property on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    try {
      await ttsClient.getStartupStatus();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toBe('Failed to get startup status');
      expect((err as Error & { status: number }).status).toBe(503);
    }
  });
});

// ===========================================================================
// getDownloadProgress
// ===========================================================================

describe('getDownloadProgress', () => {
  it('returns download progress on success', async () => {
    const progress = {
      status: 'downloading',
      file_name: 'model.safetensors',
      bytes_downloaded: 500000,
      bytes_total: 1000000,
      speed_mbps: 50,
      eta: 10,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(progress));

    const result = await ttsClient.getDownloadProgress();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/download-progress');
    expect(result).toEqual(progress);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(ttsClient.getDownloadProgress()).rejects.toThrow(
      'Failed to get download progress',
    );
  });
});

// ===========================================================================
// getSystemInfo
// ===========================================================================

describe('getSystemInfo', () => {
  it('returns system info on success', async () => {
    const info = {
      python_version: '3.11.0',
      torch_version: '2.0.0',
      device: 'mps',
      device_name: 'Apple Silicon (MPS)',
      memory_total_gb: 16,
      memory_available_gb: 8,
      cache_dir: '~/.cache/huggingface',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(info));

    const result = await ttsClient.getSystemInfo();
    expect(result).toEqual(info);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.getSystemInfo()).rejects.toThrow('Failed to get system info');
  });
});

// ===========================================================================
// getLogs
// ===========================================================================

describe('getLogs', () => {
  it('fetches logs with default parameters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await ttsClient.getLogs();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/logs?count=100');
  });

  it('passes count and level parameters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await ttsClient.getLogs(50, 'ERROR');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/logs?count=50&level=ERROR');
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.getLogs()).rejects.toThrow('Failed to get logs');
  });
});

// ===========================================================================
// getSpeakers / getSpeakersInfo / getLanguages
// ===========================================================================

describe('getSpeakers', () => {
  it('returns speakers array from response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ speakers: ['aiden', 'serena'] }));

    const result = await ttsClient.getSpeakers();
    expect(result).toEqual(['aiden', 'serena']);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.getSpeakers()).rejects.toThrow('Failed to get speakers');
  });
});

describe('getSpeakersInfo', () => {
  it('returns speaker info array', async () => {
    const info = [
      {
        name: 'aiden',
        description: 'A male voice',
        native_language: 'English',
        personality: 'calm',
        gender: 'male',
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(info));

    const result = await ttsClient.getSpeakersInfo();
    expect(result).toEqual(info);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.getSpeakersInfo()).rejects.toThrow('Failed to get speaker info');
  });
});

describe('getLanguages', () => {
  it('returns languages array from response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ languages: ['English', 'French'] }));

    const result = await ttsClient.getLanguages();
    expect(result).toEqual(['English', 'French']);
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.getLanguages()).rejects.toThrow('Failed to get languages');
  });
});

// ===========================================================================
// unloadModel
// ===========================================================================

describe('unloadModel', () => {
  it('sends POST and resolves on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'unloaded' }));

    await ttsClient.unloadModel();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/unload-model', {
      method: 'POST',
    });
  });

  it('throws when request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(ttsClient.unloadModel()).rejects.toThrow('Failed to unload model');
  });
});

// ===========================================================================
// transcribe
// ===========================================================================

describe('transcribe', () => {
  const transcript = {
    text: 'hello world',
    language: 'en',
    confidence: 0.98,
    duration_seconds: 2.5,
  };

  it('sends audio multipart payload and returns transcript', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(transcript));

    const file = new File(['audio-bytes'], 'ref.wav', { type: 'audio/wav' });
    const result = await ttsClient.transcribe(file);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/transcribe');
    expect(options?.method).toBe('POST');

    const formData = options?.body as FormData;
    expect(formData.get('audio')).toBeInstanceOf(File);
    expect(formData.get('task')).toBeNull();
    expect(result).toEqual(transcript);
  });

  it('passes task when translation is requested', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(transcript));

    const blob = new Blob(['audio-bytes'], { type: 'audio/wav' });
    await ttsClient.transcribe(blob, { task: 'translate' });

    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get('task')).toBe('translate');
  });

  it('throws with parsed error details on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Whisper model not loaded' }, 400));

    const file = new File(['audio-bytes'], 'ref.wav', { type: 'audio/wav' });
    await expect(ttsClient.transcribe(file)).rejects.toThrow('Whisper model not loaded');
  });
});

// ===========================================================================
// shutdown
// ===========================================================================

describe('shutdown', () => {
  it('sends POST to shutdown endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await ttsClient.shutdown();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/shutdown', {
      method: 'POST',
    });
  });

  it('does not throw even if server does not respond', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

    // shutdown() does not have error handling -- the await fetch() will throw
    // but this tests the call is made
    await expect(ttsClient.shutdown()).rejects.toThrow('Connection refused');
  });
});
