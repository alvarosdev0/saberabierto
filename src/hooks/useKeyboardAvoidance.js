import { useEffect } from 'react';

/**
 * useKeyboardAvoidance — scrolls the active input into view when the
 * on-screen keyboard appears (mobile).
 *
 * Per design §Mobile UX Requirements:
 *   Use the visualViewport API to detect on-screen keyboard and scroll
 *   the active input into view. All text inputs must remain visible
 *   above the keyboard.
 *
 * Usage: call at the app root or layout level. Applies to all
 * textarea, input[type="text"], input[type="search"], input[type="email"],
 * and input[type="password"] elements that receive focus.
 */
export default function useKeyboardAvoidance() {
  useEffect(() => {
    // Only on browsers that support visualViewport
    if (!window.visualViewport) return;

    const SELECTOR =
      'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="password"], input:not([type])';

    /**
     * Scroll the currently focused element into view with some bottom
     * padding so it's not flush against the keyboard edge.
     */
    function scrollActiveIntoView() {
      const el = document.activeElement;
      if (!el || !el.matches?.(SELECTOR)) return;

      // Use a small delay so the browser has time to resize the viewport
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    function onResize() {
      scrollActiveIntoView();
    }

    // Also listen for focus events so any input that gains focus
    // after the keyboard is already open gets scrolled too.
    function onFocusIn(e) {
      if (e.target?.matches?.(SELECTOR)) {
        // Small delay to let the keyboard finish appearing
        setTimeout(scrollActiveIntoView, 100);
      }
    }

    window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      window.visualViewport.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
}
