import { onMount, onDestroy } from 'svelte';

export interface KeyboardShortcutActions {
  onPlayPause?: () => void;
  onGenerate?: () => void;
  onSave?: () => void;
  onSwitchMode?: (mode: 'custom-voice' | 'voice-clone' | 'voice-design') => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  function handleKeyDown(e: KeyboardEvent) {
    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' ||
                         target.tagName === 'TEXTAREA' ||
                         target.isContentEditable;

    const isMeta = e.metaKey || e.ctrlKey;

    // Escape - always works (close panels)
    if (e.key === 'Escape') {
      e.preventDefault();
      actions.onEscape?.();
      return;
    }

    // Space - play/pause (only when not in input)
    if (e.key === ' ' && !isInputField) {
      e.preventDefault();
      actions.onPlayPause?.();
      return;
    }

    // Cmd/Ctrl shortcuts
    if (isMeta) {
      // Cmd+Enter - Generate
      if (e.key === 'Enter') {
        e.preventDefault();
        actions.onGenerate?.();
        return;
      }

      // Cmd+S - Save
      if (e.key === 's') {
        e.preventDefault();
        actions.onSave?.();
        return;
      }

      // Cmd+1/2/3 - Switch modes
      if (e.key === '1') {
        e.preventDefault();
        actions.onSwitchMode?.('custom-voice');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        actions.onSwitchMode?.('voice-clone');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        actions.onSwitchMode?.('voice-design');
        return;
      }
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
}
