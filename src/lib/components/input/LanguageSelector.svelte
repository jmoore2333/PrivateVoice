<script lang="ts">
  interface Props {
    value: string;
    onSelect?: (language: string) => void;
  }

  let { value = $bindable(), onSelect }: Props = $props();

  const languages = [
    { code: 'English', label: 'English' },
    { code: 'Chinese', label: 'Chinese (中文)' },
    { code: 'Japanese', label: 'Japanese (日本語)' },
    { code: 'Korean', label: 'Korean (한국어)' },
    { code: 'German', label: 'German (Deutsch)' },
    { code: 'French', label: 'French (Français)' },
    { code: 'Russian', label: 'Russian (Русский)' },
    { code: 'Portuguese', label: 'Portuguese (Português)' },
    { code: 'Spanish', label: 'Spanish (Español)' },
    { code: 'Italian', label: 'Italian (Italiano)' },
    { code: 'Auto', label: 'Auto-detect' },
  ];

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onSelect?.(value);
  }
</script>

<div class="space-y-2">
  <div class="block text-sm font-medium text-[var(--color-text-primary)]">
    Language
  </div>

  <div class="relative">
    <select
      {value}
      aria-label="Language"
      onchange={handleChange}
      class="w-full appearance-none px-4 py-2.5 pr-10 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors cursor-pointer"
    >
      {#each languages as lang}
        <option value={lang.code} class="bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]">{lang.label}</option>
      {/each}
    </select>
    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[var(--color-text-muted)]">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
</div>
