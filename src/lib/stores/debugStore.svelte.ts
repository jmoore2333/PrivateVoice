/**
 * Debug store for log management and system status.
 */

import { ttsClient, type LogEntry, type SystemInfo } from "$lib/api/ttsClient";

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export interface DebugLogEntry extends LogEntry {
  id: number;
}

export interface DebugState {
  logs: DebugLogEntry[];
  systemInfo: SystemInfo | null;
  systemInfoError: string | null;
  filter: LogLevel | "ALL";
  isVisible: boolean;
  isLoading: boolean;
  isLoadingSystemInfo: boolean;
  autoScroll: boolean;
}

const MAX_LOGS = 500;
let logIdCounter = 0;

function createDebugStore() {
  let state = $state<DebugState>({
    logs: [],
    systemInfo: null,
    systemInfoError: null,
    filter: "ALL",
    isVisible: false,
    isLoading: false,
    isLoadingSystemInfo: false,
    autoScroll: true,
  });

  function addLog(entry: LogEntry) {
    const debugEntry: DebugLogEntry = {
      ...entry,
      id: logIdCounter++,
    };

    state.logs = [...state.logs.slice(-(MAX_LOGS - 1)), debugEntry];
  }

  function addLogs(entries: LogEntry[]) {
    const debugEntries = entries.map((entry) => ({
      ...entry,
      id: logIdCounter++,
    }));

    state.logs = [...state.logs, ...debugEntries].slice(-MAX_LOGS);
  }

  async function fetchLogs(count: number = 100) {
    state.isLoading = true;
    try {
      const logs = await ttsClient.getLogs(count);
      addLogs(logs);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      state.isLoading = false;
    }
  }

  async function fetchSystemInfo() {
    state.isLoadingSystemInfo = true;
    state.systemInfoError = null;
    try {
      state.systemInfo = await ttsClient.getSystemInfo();
    } catch (e) {
      console.error("Failed to fetch system info:", e);
      state.systemInfoError = e instanceof Error ? e.message : "Failed to fetch system info";
    } finally {
      state.isLoadingSystemInfo = false;
    }
  }

  function clearLogs() {
    state.logs = [];
  }

  function setFilter(filter: LogLevel | "ALL") {
    state.filter = filter;
  }

  function toggleVisibility() {
    state.isVisible = !state.isVisible;
    if (state.isVisible && state.logs.length === 0) {
      fetchLogs();
      fetchSystemInfo();
    }
  }

  function show() {
    state.isVisible = true;
    if (state.logs.length === 0) {
      fetchLogs();
      fetchSystemInfo();
    }
  }

  function hide() {
    state.isVisible = false;
  }

  function setAutoScroll(enabled: boolean) {
    state.autoScroll = enabled;
  }

  function getFilteredLogs(): DebugLogEntry[] {
    if (state.filter === "ALL") {
      return state.logs;
    }

    const levelPriority: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 1,
      WARNING: 2,
      ERROR: 3,
    };

    const minPriority = levelPriority[state.filter];
    return state.logs.filter((log) => {
      const logLevel = log.level.toUpperCase() as LogLevel;
      return (levelPriority[logLevel] ?? 0) >= minPriority;
    });
  }

  return {
    get state() {
      return state;
    },
    get filteredLogs() {
      return getFilteredLogs();
    },
    addLog,
    addLogs,
    fetchLogs,
    fetchSystemInfo,
    clearLogs,
    setFilter,
    toggleVisibility,
    show,
    hide,
    setAutoScroll,
  };
}

export const debugStore = createDebugStore();
