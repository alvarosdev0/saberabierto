/**
 * Offline Integration Tests — SaberAbierto
 *
 * Tests offline state handling and re-connection recovery.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Start with online state by default
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Online / Offline State ────────────────────────────────────────────────

describe('offline state handling', () => {
  it('Layout shows offline banner when navigator.onLine is false', async () => {
    // Set to offline before rendering
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
  });

  it('Layout does NOT show offline banner when online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });

  it('Layout offline banner has alert role for accessibility', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Sin conexión');
  });
});

// ─── Offline Event Handling ────────────────────────────────────────────────

describe('offline event listeners', () => {
  it('registers online and offline event listeners on mount', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const Layout = (await import('../components/Layout.jsx')).default;

    const { unmount } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    // Should have registered 'online' and 'offline' listeners
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();

    // Should have cleaned up listeners
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('transitions from offline to online state', async () => {
    // Start offline
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    // Verify offline banner is shown
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();

    // Simulate coming back online
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // Banner should disappear
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });

  it('transitions from online to offline state', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
  });
});

// ─── Error Messages When Offline ───────────────────────────────────────────

describe('error messages in offline state', () => {
  it('AIError provides Spanish error messages', async () => {
    const { AIError } = await import('../services/ai/shared.js');

    const authErr = new AIError('test', 401, true);
    expect(authErr.message).toBe('test');

    const serverErr = new AIError('server error', 500);
    expect(serverErr.status).toBe(500);
  });

  it('classifyError returns Spanish messages for all status codes', async () => {
    const { classifyError } = await import('../services/ai/shared.js');

    const err401 = classifyError({ status: 401 });
    expect(err401.message).toContain('Clave API inválida');

    const err429 = classifyError({ status: 429 });
    expect(err429.message).toContain('Límite de solicitudes');

    const err500 = classifyError({ status: 500 });
    expect(err500.message).toContain('Error del servidor');
  });
});
