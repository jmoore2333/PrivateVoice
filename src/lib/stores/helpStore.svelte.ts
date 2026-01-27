/**
 * Help panel store for managing open/close state.
 */

function createHelpStore() {
  let isOpen = $state(false);

  return {
    get isOpen() {
      return isOpen;
    },
    open() {
      isOpen = true;
    },
    close() {
      isOpen = false;
    },
    toggle() {
      isOpen = !isOpen;
    },
  };
}

export const helpStore = createHelpStore();
