<script lang="ts">
  const speakers = [
    { id: 'serena', name: 'Serena', description: 'Warm, gentle female', accent: 'Chinese' },
    { id: 'uncle_fu', name: 'Uncle Fu', description: 'Seasoned male, mellow tone', accent: 'Chinese' },
    { id: 'vivian', name: 'Vivian', description: 'Bright young female', accent: 'Chinese' },
    { id: 'aiden', name: 'Aiden', description: 'Natural American male', accent: 'English' },
    { id: 'ryan', name: 'Ryan', description: 'Dynamic male, rhythmic delivery', accent: 'English' },
    { id: 'ono_anna', name: 'Ono Anna', description: 'Playful, light female', accent: 'Japanese' },
    { id: 'sohee', name: 'Sohee', description: 'Warm Korean female', accent: 'Korean' },
    { id: 'dylan', name: 'Dylan', description: 'Youthful male', accent: 'Chinese (Beijing)' },
    { id: 'eric', name: 'Eric', description: 'Lively male', accent: 'Chinese (Sichuan)' },
  ];
</script>

<div class="grid grid-cols-2 gap-2 mb-4">
  {#each speakers as speaker}
    <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
      <div class="font-medium text-sm text-[var(--color-text-primary)]">{speaker.name}</div>
      <div class="text-xs text-[var(--color-text-muted)]">{speaker.description}</div>
      <div class="text-xs text-[var(--color-accent)] mt-1">{speaker.accent}</div>
    </div>
  {/each}
</div>
