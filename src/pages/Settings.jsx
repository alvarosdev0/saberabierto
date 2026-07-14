import { useState, useEffect, useCallback, useRef } from 'react';
import { Moon, Sun, AlertTriangle } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import { Input, Select } from '@ninna-ui/forms';
import { PROVIDER_IDS, PROVIDER_META } from '../services/ai/index.js';
import db from '../services/db.js';

/**
 * LocalStorage key for provider selection.
 * @type {string}
 */
const LS_PROVIDER_KEY = 'sa:provider';

/**
 * LocalStorage key prefix for per-provider API keys.
 * @type {(provider: string) => string}
 */
const lsApiKey = (provider) => `sa:apiKey:${provider}`;

/**
 * Settings page — AI provider configuration, API key management,
 * and data export/import.
 *
 * Route: /settings
 *
 * Per design §Settings:
 *   - Provider selector (dropdown: DeepSeek / OpenAI / Anthropic / Gemini)
 *   - Masked API key input per selected provider
 *   - Data export button (serialize all Dexie tables → downloadable JSON)
 *   - Data import button (parse JSON → validate → restore to Dexie)
 */
export default function Settings() {
  // ── Provider state ──────────────────────────────────────────────────────
  const [provider, setProvider] = useState(() => {
    return localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
  });
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    return localStorage.getItem('sa:gemini-model') || 'gemini-3.1-flash-lite';
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  // Load saved API key for the selected provider
  useEffect(() => {
    const saved = localStorage.getItem(lsApiKey(provider));
    setApiKey(saved || '');
    setKeySaved(false);
  }, [provider]);

  // ── Provider change handler ─────────────────────────────────────────────
  const handleProviderChange = useCallback((e) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    localStorage.setItem(LS_PROVIDER_KEY, newProvider);
  }, []);

  // ── Save API key ────────────────────────────────────────────────────────
  const handleSaveKey = useCallback(() => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem(lsApiKey(provider), trimmed);
    } else {
      localStorage.removeItem(lsApiKey(provider));
    }
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  }, [apiKey, provider]);

  // ── Data Export ─────────────────────────────────────────────────────────
  const [exportStatus, setExportStatus] = useState(null); // { type: 'success'|'error', message }

  const handleExport = useCallback(async () => {
    setExportStatus(null);
    try {
      const tables = [
        'sessions',
        'sections',
        'notes',
        'questions',
        'questionnaires',
        'questionnaireItems',
        'reviewAttempts',
        'pdfCache',
        'settings',
      ];

      const data = {};
      for (const table of tables) {
        data[table] = await db.table(table).toArray();
      }

      const exportObj = {
        version: 1,
        exportedAt: new Date().toISOString(),
        app: 'SaberAbierto',
        data,
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saberabierto-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus({
        type: 'success',
        message: 'Datos exportados correctamente.',
      });
    } catch (err) {
      console.error('Export error:', err);
      setExportStatus({
        type: 'error',
        message: 'Error al exportar los datos.',
      });
    }
  }, []);

  // ── Data Import ─────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(null);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.version || !parsed.app || !parsed.data) {
        throw new Error('El archivo no tiene el formato esperado de SaberAbierto.');
      }

      const totalRecords = Object.values(parsed.data).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      setConfirmImport({ parsed, text, totalRecords, fileName: file.name });
    } catch (err) {
      setImportStatus({
        type: 'error',
        message: `Error al leer el archivo: ${err.message || 'Formato no válido'}`,
      });
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!confirmImport) return;
    const { parsed } = confirmImport;
    setConfirmImport(null);
    setImporting(true);

    try {
      const parsed = confirmImport.parsed;

      const tables = [
        'sessions',
        'sections',
        'notes',
        'questions',
        'questionnaires',
        'questionnaireItems',
        'reviewAttempts',
        'pdfCache',
        'settings',
      ];

      let imported = 0;

      for (const table of tables) {
        if (parsed.data[table] && Array.isArray(parsed.data[table])) {
          // Clear existing data in this table
          await db.table(table).clear();
          // Bulk add imported data
          if (parsed.data[table].length > 0) {
            await db.table(table).bulkAdd(parsed.data[table]);
            imported += parsed.data[table].length;
          }
        }
      }

      setImportStatus({
        type: 'success',
        message: `Importación completada: ${imported} registros restaurados.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      setImportStatus({
        type: 'error',
        message: `Error al importar: ${err.message || 'Archivo no válido'}`,
      });
    } finally {
      setImporting(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  // ── Fetch available Gemini models ─────────────────────────────────────────
  const handleFetchModels = useCallback(async () => {
    if (!apiKey.trim()) return;
    setFetchingModels(true);
    setAvailableModels([]);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.models) {
        // Filter to flash/lite models (text generation)
        const flashModels = data.models
          .filter((m) => {
            const name = m.name.replace('models/', '');
            // Only include models that support generateContent
            const supported = m.supportedGenerationMethods?.includes('generateContent');
            return supported && (name.includes('flash') || name.includes('lite'));
          })
          .map((m) => ({
            id: m.name.replace('models/', ''),
            description: m.displayName || m.name.replace('models/', ''),
          }));

        setAvailableModels(flashModels);

        // Auto-select first model if current isn't available
        if (flashModels.length > 0 && !flashModels.find((m) => m.id === geminiModel)) {
          setGeminiModel(flashModels[0].id);
          localStorage.setItem('sa:gemini-model', flashModels[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setFetchingModels(false);
    }
  }, [apiKey, geminiModel]);

  // ── Render ──────────────────────────────────────────────────────────────
  const meta = PROVIDER_META[provider] || PROVIDER_META.deepseek;

  return (
    <div className="flex flex-col gap-8 p-4 max-w-2xl mx-auto">
      {/* Page header */}
      <div>
        <Heading as="h1" size="2xl" className="text-purple-900">Ajustes</Heading>
        <Text size="sm" className="text-base-content/50 mt-1">
          Configura tu proveedor de IA y gestiona tus datos de estudio
        </Text>
      </div>

      {/* ── Provider Selection ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <Heading as="h2" size="lg" className="text-base-content">Proveedor de IA</Heading>

        <div className="flex flex-col gap-2">
          <Text size="sm" as="label" htmlFor="provider-select" className="font-medium text-base-content">
            Selecciona el proveedor para generar preguntas
          </Text>
          <Select
            id="provider-select"
            value={provider}
            onChange={handleProviderChange}
            className="w-full"
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_META[id]?.name || id}
              </option>
            ))}
          </Select>
          <Text size="xs" className="text-base-content/40">
            Modelo: {provider === 'gemini' ? geminiModel : meta.model}
          </Text>
        </div>

        {/* API Key Input */}
        <div className="flex flex-col gap-2">
          <Text size="sm" as="label" htmlFor="api-key-input" className="font-medium text-base-content">
            Clave API de {meta.name}
          </Text>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeySaved(false);
                }}
                placeholder={`Ingresa tu clave API de ${meta.name}...`}
                className="w-full font-mono pr-12"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-base-content/40 hover:text-base-content/60 transition-colors"
                style={{ minWidth: '44px', minHeight: '44px' }}
                aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
                title={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showKey ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            <Button
              color={keySaved ? 'success' : 'primary'}
              variant={keySaved ? 'soft' : undefined}
              onClick={handleSaveKey}
              className="whitespace-nowrap"
            >
              {keySaved ? '✓ Guardada' : 'Guardar'}
            </Button>
          </div>
          <Text size="xs" className="text-base-content/40">
            Tu clave se almacena solo en este dispositivo (localStorage).
            Nunca se envía a nuestros servidores.
          </Text>
        </div>
      </section>

      {/* ── Gemini Model Selector ──────────────────────────────────────────── */}
      {provider === 'gemini' && (
        <section className="flex flex-col gap-4">
          <Heading as="h2" size="lg" className="text-base-content">Modelo Gemini</Heading>

          <div className="flex flex-col gap-3 p-4 bg-base-100 border border-base-content/10 rounded-xl">
            <Text size="xs" className="text-base-content/50">
              Elige el modelo Gemini que quieres usar. Los modelos disponibles dependen de tu API key.
            </Text>

            {/* Model selector */}
            <div className="flex gap-2">
              <Select
                value={geminiModel}
                onChange={(e) => {
                  setGeminiModel(e.target.value);
                  localStorage.setItem('sa:gemini-model', e.target.value);
                }}
                className="flex-1"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.description}
                    </option>
                  ))
                ) : (
                  <option value={geminiModel}>{geminiModel}</option>
                )}
              </Select>

              <Button
                variant="outline"
                onClick={handleFetchModels}
                disabled={fetchingModels || !apiKey.trim()}
                className="whitespace-nowrap"
              >
                {fetchingModels ? 'Cargando...' : 'Ver modelos disponibles'}
              </Button>
            </div>

            {/* Model info */}
            <Text size="xs" className="text-base-content/40">
              Modelo actual: <code className="bg-base-content/10 px-1 rounded">{geminiModel}</code>
              {availableModels.length > 0 && ` · ${availableModels.length} modelos disponibles`}
            </Text>
          </div>
        </section>
      )}

      {/* ── Dark Mode ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <Heading as="h2" size="lg" className="text-base-content">Apariencia</Heading>
        <div className="flex items-center justify-between p-4 bg-base-100 border border-base-content/10 rounded-xl">
          <div>
            <Heading as="h3" size="sm" className="text-base-content">Modo oscuro</Heading>
            <Text size="xs" className="text-base-content/50 mt-1">
              Cambia entre tema claro y oscuro
            </Text>
          </div>
          <button
            type="button"
            onClick={() => {
              const isDark = document.documentElement.classList.toggle('dark');
              localStorage.setItem('sa:dark-mode', isDark ? '1' : '0');
              // Force re-render
              setDarkMode(isDark);
            }}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              darkMode ? 'bg-purple-600' : 'bg-gray-300'
            }`}
            style={{ minHeight: 'auto', minWidth: 'auto' }}
            aria-label="Alternar modo oscuro"
            role="switch"
            aria-checked={darkMode}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm flex items-center justify-center transition-transform ${
                darkMode ? 'translate-x-7' : ''
              }`}
            >
              {darkMode ? <Moon size={12} className="text-purple-600" /> : <Sun size={12} className="text-amber-500" />}
            </span>
          </button>
        </div>
      </section>

      {/* ── Data Management ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <Heading as="h2" size="lg" className="text-base-content">Gestión de datos</Heading>

        {/* Export */}
        <div className="flex flex-col gap-3 p-4 bg-base-100 border border-base-content/10 rounded-xl">
          <div>
            <Heading as="h3" size="sm" className="text-base-content">Exportar datos</Heading>
            <Text size="xs" className="text-base-content/50 mt-1">
              Descarga todas tus sesiones, preguntas, repasos y configuraciones en un archivo JSON.
            </Text>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            className="self-start"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar datos
          </Button>
          {exportStatus && (
            <Text
              size="xs"
              className={`px-3 py-2 rounded-md ${
                exportStatus.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
              role="status"
            >
              {exportStatus.message}
            </Text>
          )}
        </div>

        {/* Import */}
        <div className="flex flex-col gap-3 p-4 bg-base-100 border border-base-content/10 rounded-xl">
          <div>
            <Heading as="h3" size="sm" className="text-base-content">Importar datos</Heading>
            <Text size="xs" className="text-base-content/50 mt-1">
              Restaura tus datos desde un archivo JSON exportado previamente.
              <strong className="text-amber-700"> Los datos actuales serán reemplazados.</strong>
            </Text>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
            aria-hidden="true"
          />

          {/* Confirmation dialog */}
          {confirmImport && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <Text size="sm" className="font-semibold text-red-800 dark:text-red-300 mb-2">
                <AlertTriangle size={18} aria-hidden="true" className="inline mr-1 text-red-700" />¿Estás seguro?
              </Text>
              <Text size="xs" className="text-red-700 dark:text-red-400 mb-3">
                Se reemplazarán todos tus datos actuales con los del archivo{' '}
                <strong>{confirmImport.fileName}</strong> ({confirmImport.totalRecords} registros).
                Esta acción no se puede deshacer.
              </Text>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmImport(null)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  color="danger"
                  onClick={handleConfirmImport}
                  className="flex-1"
                >
                  Sí, reemplazar datos
                </Button>
              </div>
            </div>
          )}

          {!confirmImport && (
            <Button
              variant="outline"
              onClick={handleImportClick}
              disabled={importing}
              className="self-start"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-base-content/30 border-t-base-content rounded-full animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Importar datos
                </>
              )}
            </Button>
          )}
          {importStatus && (
            <Text
              size="xs"
              className={`px-3 py-2 rounded-md ${
                importStatus.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
              role="status"
            >
              {importStatus.message}
            </Text>
          )}
        </div>
      </section>

      {/* ── App Info ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 pt-4 border-t border-base-content/10">
        <Heading as="h2" size="lg" className="text-base-content">Acerca de</Heading>
        <div className="text-sm text-base-content/50 leading-relaxed">
          <p><strong>SaberAbierto</strong> v1.0.0</p>
          <p className="mt-1">
            Metodología de estudio con lectura interrogativa, descarga de ideas,
            cuestionarios y repaso espaciado (SM-2).
          </p>
          <p className="mt-2">
            Todos los datos se almacenan en tu dispositivo. No enviamos
            información a servidores externos (excepto las llamadas a la API
            del proveedor de IA que configures).
          </p>
        </div>
      </section>
    </div>
  );
}
