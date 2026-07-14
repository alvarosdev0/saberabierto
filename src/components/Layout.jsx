import { Outlet, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Home, Upload, RefreshCw, Settings } from 'lucide-react';

export default function Layout() {
  const [updateReady, setUpdateReady] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // ── PWA update listener ──────────────────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          }
        });
      });
    }
  }, []);

  // ── Online / offline listener ────────────────────────────────────────────
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdate = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium" role="alert">
          Sin conexión — los cambios se guardarán localmente
        </div>
      )}

      {/* PWA update banner */}
      {updateReady && (
        <div className="bg-primary text-white px-4 py-2 flex items-center justify-between" role="alert">
          <span className="text-sm">Nueva versión disponible</span>
          <button
            onClick={handleUpdate}
            className="bg-white dark:bg-surface text-primary px-3 py-1 rounded text-sm font-medium"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            Actualizar
          </button>
        </div>
      )}

      {/* Main content area — scrollable, padded for the fixed nav */}
      <main className="flex-1 pb-16 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation — fixed, always visible */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-base-100/95 backdrop-blur-sm border-t border-base-content/10 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.3)] flex justify-around py-2 safe-area-bottom" role="navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center text-xs px-2 py-1 ${isActive ? 'text-primary' : 'text-base-content/50'}`
          }
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Home size={22} aria-hidden="true" />
          <span>Inicio</span>
        </NavLink>
        <NavLink
          to="/upload"
          className={({ isActive }) =>
            `flex flex-col items-center text-xs px-2 py-1 ${isActive ? 'text-primary' : 'text-base-content/50'}`
          }
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Upload size={22} aria-hidden="true" />
          <span>Subir</span>
        </NavLink>
        <NavLink
          to="/review"
          className={({ isActive }) =>
            `flex flex-col items-center text-xs px-2 py-1 ${isActive ? 'text-primary' : 'text-base-content/50'}`
          }
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <RefreshCw size={22} aria-hidden="true" />
          <span>Repaso</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex flex-col items-center text-xs px-2 py-1 ${isActive ? 'text-primary' : 'text-base-content/50'}`
          }
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Settings size={22} aria-hidden="true" />
          <span>Ajustes</span>
        </NavLink>
      </nav>
    </div>
  );
}
