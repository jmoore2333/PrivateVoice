/**
 * Help panel store for managing open/close state.
 */

function createHelpStore() {
  let isOpen = $state(false);
  let targetSection = $state<string | null>(null);

  return {
    get isOpen() {
      return isOpen;
    },
    get targetSection() {
      return targetSection;
    },
    open(sectionId?: string) {
      isOpen = true;
      targetSection = sectionId ?? null;
    },
    close() {
      isOpen = false;
      targetSection = null;
    },
    toggle() {
      isOpen = !isOpen;
      if (!isOpen) {
        targetSection = null;
      }
    },
  };
}

export const helpStore = createHelpStore();
