<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { ttsStore } from "$lib/stores/ttsStore.svelte";
  import { PRESET_SPEAKERS, type Speaker } from "$lib/api/ttsClient";

  const { state: ttsState } = ttsStore;

  // Available models
  const MODELS = [
    { id: "0.6b", name: "0.6B (Fast)", description: "Custom Voice only" },
    { id: "1.7b", name: "1.7B (Quality)", description: "Custom Voice" },
    { id: "1.7b-design", name: "1.7B Design", description: "Voice Design mode" },
  ] as const;

  let selectedModelId = $state("0.6b");
  let audioElement: HTMLAudioElement;
  let healthInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Start the TTS server sidecar
    (async () => {
      try {
        await invoke("start_tts_server");
        // Wait a moment for server to start
        await new Promise((r) => setTimeout(r, 1000));
        await ttsStore.checkServerHealth();
      } catch (e) {
        console.error("Failed to start TTS server:", e);
      }
    })();

    // Poll for server health
    healthInterval = setInterval(() => {
      if (!ttsState.serverConnected) {
        ttsStore.checkServerHealth();
      }
    }, 2000);
  });

  onDestroy(() => {
    if (healthInterval) {
      clearInterval(healthInterval);
    }
  });

  function handleGenerate() {
    ttsStore.generate();
  }

  function handleLoadModel() {
    ttsStore.loadModel(selectedModelId);
  }

  function handleModelChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedModelId = target.value;
  }

  function handleSpeakerChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    ttsStore.setSpeaker(target.value as Speaker);
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    ttsStore.setReferenceAudio(file);
  }
</script>

<main class="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-6">
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <header class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
        Qwen3-TTS
      </h1>
      <p class="text-neutral-600 dark:text-neutral-400">
        Text-to-speech for Apple Silicon
      </p>
    </header>

    <!-- Status Bar -->
    <div
      class="mb-6 p-4 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span
            class="w-2 h-2 rounded-full {ttsState.serverConnected
              ? 'bg-green-500'
              : 'bg-red-500'}"
          ></span>
          <span class="text-sm text-neutral-600 dark:text-neutral-400">
            {ttsState.serverConnected ? "Server connected" : "Connecting..."}
          </span>
        </div>

        {#if ttsState.modelLoaded}
          <span class="text-sm text-green-600 dark:text-green-400">
            {ttsState.modelId} on {ttsState.device}
          </span>
        {/if}
      </div>

      {#if ttsState.serverConnected}
        <div class="flex items-center gap-3">
          <select
            value={selectedModelId}
            onchange={handleModelChange}
            disabled={ttsState.isLoadingModel}
            class="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white disabled:opacity-50"
          >
            {#each MODELS as model}
              <option value={model.id}>{model.name} - {model.description}</option>
            {/each}
          </select>
          <button
            onclick={handleLoadModel}
            disabled={ttsState.isLoadingModel}
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {#if ttsState.isLoadingModel}
              Loading...
            {:else if ttsState.modelLoaded && ttsState.modelId === selectedModelId}
              Reload
            {:else}
              Load Model
            {/if}
          </button>
        </div>
      {/if}
    </div>

    <!-- Error Display -->
    {#if ttsState.error}
      <div
        class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
      >
        <p class="text-red-700 dark:text-red-400 text-sm">{ttsState.error}</p>
        <button
          onclick={() => ttsStore.clearError()}
          class="text-red-600 dark:text-red-500 text-xs underline mt-1"
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Mode Tabs -->
    <div class="mb-6 flex gap-2">
      {#each [["custom-voice", "Custom Voice"], ["voice-clone", "Voice Clone"], ["voice-design", "Voice Design"]] as [mode, label]}
        <button
          onclick={() => ttsStore.setMode(mode as any)}
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
            {ttsState.mode === mode
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <!-- Main Form -->
    <div
      class="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6"
    >
      <!-- Text Input -->
      <div class="mb-4">
        <label
          for="text"
          class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
        >
          Text to speak
        </label>
        <textarea
          id="text"
          rows="4"
          bind:value={ttsState.text}
          oninput={(e) => ttsStore.setText(e.currentTarget.value)}
          placeholder="Enter the text you want to convert to speech..."
          class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        ></textarea>
      </div>

      <!-- Custom Voice Options -->
      {#if ttsState.mode === "custom-voice"}
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label
              for="speaker"
              class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Speaker
            </label>
            <select
              id="speaker"
              value={ttsState.speaker}
              onchange={handleSpeakerChange}
              class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
            >
              {#each PRESET_SPEAKERS as speaker}
                <option value={speaker}>{speaker}</option>
              {/each}
            </select>
          </div>

          <div>
            <label
              for="instruction"
              class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Style (optional)
            </label>
            <input
              id="instruction"
              type="text"
              bind:value={ttsState.instruction}
              oninput={(e) => ttsStore.setInstruction(e.currentTarget.value)}
              placeholder="e.g., speaks slowly"
              class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400"
            />
          </div>
        </div>
      {/if}

      <!-- Voice Clone Options -->
      {#if ttsState.mode === "voice-clone"}
        <div class="space-y-4 mb-4">
          <div>
            <label
              for="refAudio"
              class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Reference Audio
            </label>
            <input
              id="refAudio"
              type="file"
              accept="audio/*"
              onchange={handleFileChange}
              class="w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
            />
          </div>

          <div>
            <label
              for="refText"
              class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Reference Text (what's spoken in the audio)
            </label>
            <input
              id="refText"
              type="text"
              bind:value={ttsState.referenceText}
              oninput={(e) => ttsStore.setReferenceText(e.currentTarget.value)}
              placeholder="Transcript of the reference audio..."
              class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400"
            />
          </div>
        </div>
      {/if}

      <!-- Voice Design Options -->
      {#if ttsState.mode === "voice-design"}
        <div class="mb-4">
          <label
            for="voiceDesc"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Voice Description
          </label>
          <textarea
            id="voiceDesc"
            rows="2"
            bind:value={ttsState.voiceDescription}
            oninput={(e) => ttsStore.setVoiceDescription(e.currentTarget.value)}
            placeholder="Describe the voice: e.g., A deep male voice with a British accent, speaking in a calm and reassuring manner..."
            class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400"
          ></textarea>
          {#if ttsState.modelId !== "1.7b-design"}
            <p class="mt-2 p-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-amber-700 dark:text-amber-400">
              Voice Design requires the 1.7B Design model. Please select and load it above.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Generate Button -->
      <button
        onclick={handleGenerate}
        disabled={!ttsState.modelLoaded || ttsState.isGenerating || !ttsState.text.trim()}
        class="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {#if ttsState.isGenerating}
          <span class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
                fill="none"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating...
          </span>
        {:else}
          Generate Speech
        {/if}
      </button>
    </div>

    <!-- Audio Player -->
    {#if ttsState.audioUrl}
      <div
        class="mt-6 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Generated Audio
          </span>
          <button
            onclick={() => ttsStore.downloadAudio()}
            class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Download WAV
          </button>
        </div>
        <audio
          bind:this={audioElement}
          src={ttsState.audioUrl}
          controls
          class="w-full"
        ></audio>
      </div>
    {/if}
  </div>
</main>
