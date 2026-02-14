<script lang="ts">
  interface Props {
    seed: number | null;
    onSeedChange?: (seed: number | null) => void;
  }

  let {
    seed = $bindable(),
    onSeedChange,
  }: Props = $props();

  let copied = $state(false);
  const seedInputId = `seed-input-${Math.random().toString(36).slice(2, 8)}`;

  function updateSeedFromInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      seed = null;
      onSeedChange?.(null);
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    seed = parsed;
    onSeedChange?.(parsed);
  }

  function randomSeed() {
    let nextSeed = Math.floor(Math.random() * 2_147_483_647);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      nextSeed = values[0] % 2_147_483_647;
    }
    seed = nextSeed;
    onSeedChange?.(nextSeed);
  }

  function clearSeed() {
    seed = null;
    onSeedChange?.(null);
  }

  async function copySeed() {
    if (seed === null) return;
    try {
      await navigator.clipboard.writeText(seed.toString());
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1200);
    } catch {
      copied = false;
    }
  }
</script>

<details class="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
  <summary class="px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] cursor-pointer select-none">
    Advanced
  </summary>
  <div class="px-3 pb-3 pt-1 space-y-2">
    <div class="flex items-center justify-between">
      <label
        class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]"
        for={seedInputId}
      >
        Seed (optional)
      </label>
      {#if seed !== null}
        <button
          class="text-xs text-[var(--color-accent)] hover:underline"
          onclick={copySeed}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      {/if}
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <input
        id={seedInputId}
        type="number"
        inputmode="numeric"
        min="0"
        step="1"
        value={seed ?? ""}
        oninput={(event) => updateSeedFromInput((event.target as HTMLInputElement).value)}
        placeholder="e.g. 12345"
        class="col-span-2 sm:col-span-1 min-w-0 w-full px-3 py-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
      />
      <button
        class="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--color-border-default)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
        onclick={randomSeed}
      >
        Random
      </button>
      <button
        class="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--color-border-default)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
        onclick={clearSeed}
        disabled={seed === null}
      >
        Clear
      </button>
    </div>
  </div>
</details>
