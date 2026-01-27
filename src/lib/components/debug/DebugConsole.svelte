<script lang="ts">
  import { tick } from "svelte";
  import { debugStore, type LogLevel } from "$lib/stores/debugStore.svelte";
  import LogEntry from "./LogEntry.svelte";
  import SystemStatus from "./SystemStatus.svelte";

  let logContainer: HTMLDivElement | undefined = $state(undefined);
  let activeTab: "logs" | "system" = $state("logs");

  const filterOptions: Array<{ value: LogLevel | "ALL"; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "DEBUG", label: "Debug" },
    { value: "INFO", label: "Info" },
    { value: "WARNING", label: "Warn" },
    { value: "ERROR", label: "Error" },
  ];

  // Auto-scroll when new logs arrive
  $effect(() => {
    const logs = debugStore.filteredLogs;
    if (debugStore.state.autoScroll && logContainer && logs.length > 0) {
      tick().then(() => {
        if (logContainer) {
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      });
    }
  });

  function handleRefresh() {
    debugStore.fetchLogs(100);
    debugStore.fetchSystemInfo();
  }

  function handleScroll() {
    if (!logContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainer;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    debugStore.setAutoScroll(isAtBottom);
  }
</script>

{#if debugStore.state.isVisible}
  <div
    class="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 shadow-2xl z-40"
    style="height: 280px;"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700 bg-neutral-800">
      <div class="flex items-center gap-4">
        <span class="text-sm font-medium text-neutral-200">Debug Console</span>

        <!-- Tabs -->
        <div class="flex gap-1">
          <button
            onclick={() => (activeTab = "logs")}
            class="px-2 py-1 text-xs rounded {activeTab === 'logs'
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'}"
          >
            Logs
          </button>
          <button
            onclick={() => (activeTab = "system")}
            class="px-2 py-1 text-xs rounded {activeTab === 'system'
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'}"
          >
            System
          </button>
        </div>
      </div>

      <div class="flex items-center gap-3">
        {#if activeTab === "logs"}
          <!-- Filter dropdown -->
          <select
            value={debugStore.state.filter}
            onchange={(e) => debugStore.setFilter(e.currentTarget.value as LogLevel | "ALL")}
            class="px-2 py-1 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-200"
          >
            {#each filterOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>

          <!-- Log count -->
          <span class="text-xs text-neutral-500">
            {debugStore.filteredLogs.length} logs
          </span>

          <!-- Clear button -->
          <button
            onclick={() => debugStore.clearLogs()}
            class="text-xs text-neutral-400 hover:text-white"
          >
            Clear
          </button>
        {/if}

        <!-- Refresh button -->
        <button
          onclick={handleRefresh}
          disabled={debugStore.state.isLoading}
          class="text-xs text-neutral-400 hover:text-white disabled:opacity-50"
        >
          {debugStore.state.isLoading ? "Loading..." : "Refresh"}
        </button>

        <!-- Close button -->
        <button
          onclick={() => debugStore.hide()}
          class="text-neutral-400 hover:text-white"
          aria-label="Close debug console"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    {#if activeTab === "logs"}
      <div
        bind:this={logContainer}
        onscroll={handleScroll}
        class="h-[calc(100%-44px)] overflow-y-auto bg-neutral-900"
      >
        {#if debugStore.filteredLogs.length === 0}
          <div class="flex items-center justify-center h-full text-neutral-500 text-sm">
            No logs yet
          </div>
        {:else}
          {#each debugStore.filteredLogs as log (log.id)}
            <LogEntry level={log.level} message={log.message} timestamp={log.timestamp} />
          {/each}
        {/if}
      </div>
    {:else}
      <div class="p-4">
        <SystemStatus
          info={debugStore.state.systemInfo}
          isLoading={debugStore.state.isLoadingSystemInfo}
          error={debugStore.state.systemInfoError}
          onRetry={() => debugStore.fetchSystemInfo()}
        />
      </div>
    {/if}
  </div>
{/if}
