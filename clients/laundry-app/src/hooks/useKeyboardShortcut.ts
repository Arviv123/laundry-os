import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  handler: (e: KeyboardEvent) => void;
  enabled?: boolean;
}

export function useKeyboardShortcut(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;

      if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch) {
        // Ctrl+key combos should work even in inputs
        if (isInput && !shortcut.ctrl) continue;
        e.preventDefault();
        shortcut.handler(e);
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
