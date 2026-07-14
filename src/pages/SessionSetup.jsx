import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Brain, Sparkles, ChevronRight, ChevronLeft, Check, Loader2, BookOpen, PenSquare, Bot, Clock, DollarSign, BadgePercent, Lightbulb, Play } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import db from '../services/db.js';
import { createProvider, PROVIDER_META } from '../services/ai/index.js';

const LS_PROVIDER_KEY = 'sa:provider';
const lsApiKey = (provider) => `sa:apiKey:${provider}`;

/**
 * SessionSetup — elige modo (IA / Manual) antes de empezar a estudiar.
 *
 * Muestra las secciones detectadas, costo estimado si es modo IA,
 * y explica las diferencias entre modos.
 *
 * Route: /session/:id/setup
 */
export default function SessionSetup() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [sections, setSections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(''); // '' | 'manual' | 'ai'
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [genDone, setGenDone] = useState(false);
  const [costs, setCosts] = useState(null);

  // ── Load session data ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const s = await db.sessions.get(Number(sessionId));
        if (!s || cancelled) { setLoading(false); return; }
        setSession(s);

        const secs = await db.sections
          .where('sessionId')
          .equals(Number(sessionId))
          .sortBy('order');
        if (cancelled) return;
        setSections(secs);

        const nts = [];
        for (const sec of secs) {
          const note = await db.notes.where('sectionId').equals(sec.id).first();
          if (note) nts.push({ sectionId: sec.id, text: note.text || '' });
        }
        if (!cancelled) setNotes(nts);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading session setup:', err);
          setError('Error al cargar la sesión.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Token estimate helper ───────────────────────────────────────────────
  const estimateTokens = (text) => Math.ceil((text?.length || 0) / 3.5);

  // ── Calculate costs when mode is AI ────────────────────────────────────
  useEffect(() => {
    if (mode !== 'ai' || notes.length === 0) {
      setCosts(null);
      return;
    }

    const providerId = localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
    const totalTokens = notes.reduce((sum, n) => sum + estimateTokens(n.text), 0);

    // Approximate pricing per 1M tokens
    const pricing = {
      deepseek: { in: 0.14, out: 0.28, label: 'DeepSeek' },
      openai: { in: 0.15, out: 0.60, label: 'OpenAI' },
      anthropic: { in: 0.80, out: 4.00, label: 'Anthropic' },
      gemini: { in: 0.10, out: 0.40, label: 'Gemini', freeTier: true },
    };

    const p = pricing[providerId] || pricing.deepseek;
    const cost = ((totalTokens / 1_000_000) * p.in) + ((500 / 1_000_000) * p.out * sections.length);

    setCosts({
      totalTokens,
      cost,
      provider: p.label,
      freeTier: p.freeTier,
      sections: notes.map((n) => ({
        tokens: estimateTokens(n.text),
      })),
    });
  }, [mode, notes, sections.length]);

  // ── Generate questions for ALL sections ────────────────────────────────
  const handleGenerateAll = useCallback(async () => {
    const providerId = localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
    const apiKey = localStorage.getItem(lsApiKey(providerId));

    if (!apiKey) {
      setError('No hay clave API configurada. Ve a Ajustes para configurarla.');
      return;
    }

    setGenerating(true);
    setGenProgress({ current: 0, total: notes.length });
    setError(null);

    const language = session?.language || localStorage.getItem('sa:language') || 'es';
    const provider = createProvider(providerId, apiKey);
    let lastErr = null;
    let totalSaved = 0;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (!note.text || !note.text.trim()) {
        setGenProgress((p) => ({ ...p, current: p.current + 1 }));
        continue;
      }

      try {
        const result = await provider.generateQuestions(note.text, {
          count: 5,
          language,
        });

        if (result.error) {
          lastErr = result.error;
        } else if (result.questions && result.questions.length > 0) {
          for (const q of result.questions) {
            await db.questions.add({
              sectionId: note.sectionId,
              text: q.text,
              type: q.type || 'keyword',
              answered: false,
              answeredAt: null,
            });
            totalSaved++;
          }
        }
      } catch (err) {
        lastErr = err.message || 'Error desconocido al generar preguntas.';
        console.warn(`Error generating questions for section ${i + 1}:`, err);
      }

      setGenProgress((p) => ({ ...p, current: p.current + 1 }));
    }

    setGenerating(false);

    if (totalSaved > 0) {
      setGenDone(true);
    } else {
      setError(lastErr || 'No se generaron preguntas. Verifica tu clave API e intenta de nuevo.');
    }
  }, [notes, session?.language]);

  // ── Start studying ─────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!mode) return;

    // Save mode to session
    try {
      await db.sessions.update(Number(sessionId), { mode });
    } catch {}

    // Navigate to first section
    if (sections.length > 0) {
      navigate(`/session/${sessionId}/section/${sections[0].id}/read`, { replace: true });
    }
  }, [mode, sessionId, sections, navigate]);

  // ── Loading / Error states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/50">Cargando sesión…</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div role="alert" className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          <p className="font-medium">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto pb-24">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <Heading as="h1" size="2xl">Configurar estudio</Heading>
        <Text size="sm" className="text-base-content/70 mt-1">
          {session?.subject || 'Sesión de estudio'}
        </Text>
      </div>

      {/* ── Sections list ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Heading as="h2" size="sm" className="text-base-content flex items-center gap-2">
          <BookOpen size={16} aria-hidden="true" />
          Secciones detectadas ({sections.length})
        </Heading>

        {sections.map((sec, i) => {
          const note = notes.find((n) => n.sectionId === sec.id);
          const chars = note?.text?.length || 0;
          const tokens = estimateTokens(note?.text);

          return (
            <div
              key={sec.id}
              className="bg-base-100 rounded-xl border border-base-content/10 p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Text size="xs" className="text-base-content/40 font-medium">Sección {i + 1}</Text>
                  <Heading as="h3" size="sm" className="text-base-content">{sec.title}</Heading>
                </div>
                <Text size="xs" className="text-base-content/40 whitespace-nowrap">
                  {chars.toLocaleString()} chars · ~{tokens} tokens
                </Text>
              </div>
              <Text size="xs" className="text-base-content/50 leading-relaxed">
                {sec.title === 'Introducción'
                  ? 'Lee y comprende los fundamentos del tema para construir una base sólida antes de las preguntas.'
                  : 'Analiza los conceptos presentados y prepárate para formular preguntas que refuercen tu comprensión.'}
              </Text>
              {mode === 'ai' && costs && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-primary font-medium">
                    ~{tokens} tokens
                  </span>
                  <span className="text-base-content/20">·</span>
                  <span className="text-base-content/50">
                    {costs.freeTier
                      ? <><BadgePercent size={12} aria-hidden="true" className="inline mr-0.5" /> Gratis</>
                      : `~$${((tokens / 1_000_000) * (costs.cost / costs.totalTokens || 0.15)).toFixed(6)} USD`
                    }
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Mode selector ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Heading as="h2" size="sm" className="text-base-content">Modo de estudio</Heading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Manual mode */}
          <button
            type="button"
            onClick={() => { setMode('manual'); setGenDone(false); }}
            className={`text-left rounded-xl border-2 p-4 flex flex-col gap-3 transition-[border-color,background-color,box-shadow] ${
              mode === 'manual'
                ? 'border-primary bg-primary/10 shadow-md'
                : 'border-base-content/10 bg-base-100 hover:border-base-300'
            }`}
            style={{ minHeight: '44px' }}
          >
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === 'manual' ? 'bg-primary' : 'bg-base-200'}`}>
                <Brain size={22} aria-hidden="true" className={mode === 'manual' ? 'text-primary-content' : 'text-base-content/50'} />
              </div>
              <span className={`font-bold ${mode === 'manual' ? 'text-primary' : 'text-base-content'}`}>
                <PenSquare size={18} aria-hidden="true" className="mr-1 inline" />
                Yo mismo
              </span>
            </div>

            <div className="flex flex-col gap-1 text-xs text-base-content/70 leading-relaxed">
              <p><strong>Tú</strong> lees el texto y escribes tus propias preguntas. El acto de formular preguntas refuerza la comprensión y la retención a largo plazo.</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="px-2 py-0.5 bg-success/10 text-success rounded"><Check size={12} aria-hidden="true" className="inline mr-0.5" />Mayor retención</span>
                <span className="px-2 py-0.5 bg-success/10 text-success rounded"><Check size={12} aria-hidden="true" className="inline mr-0.5" />Sin costo</span>
                <span className="px-2 py-0.5 bg-warning/10 text-warning rounded"><Clock size={12} aria-hidden="true" className="inline mr-0.5" />Más lento</span>
              </div>
            </div>
          </button>

          {/* AI mode */}
          <button
            type="button"
            onClick={() => { setMode('ai'); setGenDone(false); }}
            className={`text-left rounded-xl border-2 p-4 flex flex-col gap-3 transition-[border-color,background-color,box-shadow] ${
              mode === 'ai'
                ? 'border-primary bg-primary/10 shadow-md'
                : 'border-base-content/10 bg-base-100 hover:border-base-300'
            }`}
            style={{ minHeight: '44px' }}
          >
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === 'ai' ? 'bg-primary' : 'bg-base-200'}`}>
                <Sparkles size={22} aria-hidden="true" className={mode === 'ai' ? 'text-primary-content' : 'text-base-content/50'} />
              </div>
              <span className={`font-bold ${mode === 'ai' ? 'text-primary' : 'text-base-content'}`}>
                <Bot size={18} aria-hidden="true" className="mr-1 inline" />
                Asistido por IA
              </span>
            </div>

            <div className="flex flex-col gap-1 text-xs text-base-content/70 leading-relaxed">
              <p>La IA analiza el texto y genera preguntas balanceadas de los 3 tipos. Luego puedes <strong>editarlas</strong>, descartarlas o mezclarlas con las tuyas.</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="px-2 py-0.5 bg-success/10 text-success rounded"><Check size={12} aria-hidden="true" className="inline mr-0.5" />Más rápido</span>
                <span className="px-2 py-0.5 bg-success/10 text-success rounded"><Check size={12} aria-hidden="true" className="inline mr-0.5" />Editable</span>
                <span className="px-2 py-0.5 bg-warning/10 text-warning rounded"><DollarSign size={12} aria-hidden="true" className="inline mr-0.5" />Con costo</span>
              </div>

              {/* Cost summary */}
              {costs && (
                <div className="mt-2 p-2 bg-base-100 rounded-lg border border-base-content/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-base-content/50">Tokens totales:</span>
                    <span className="font-medium text-base-content">~{costs.totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-base-content/50">Proveedor:</span>
                    <span className="font-medium text-base-content">{costs.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-base-content/10">
                    <span className="text-base-content/50">Costo estimado:</span>
                    <span className={`font-bold ${costs.freeTier ? 'text-success' : 'text-warning'}`}>
                      {costs.freeTier
                        ? <><BadgePercent size={12} aria-hidden="true" className="inline mr-0.5" /> Gratis (tier free)</>
                        : `~$${costs.cost.toFixed(4)} USD`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Toggle hint */}
        {mode && (
          <Text size="xs" className="text-base-content/40 text-center">
            <Lightbulb size={12} aria-hidden="true" className="inline mr-0.5" />
            {mode === 'ai'
              ? 'Durante el estudio podrás cambiar a modo manual si lo prefieres.'
              : 'Durante el estudio podrás cambiar a modo IA si lo prefieres.'
            }
          </Text>
        )}
      </div>

      {/* ── Extra: Tooltip explaining modes further ──────────────────────── */}
      <details className="text-xs text-base-content/50 bg-base-200 rounded-xl p-3">
        <summary className="cursor-pointer font-medium text-base-content hover:text-primary">
          ¿Cuál es la diferencia entre ambos modos?
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="bg-base-100 rounded-lg p-3 border border-base-content/10">
            <p className="font-semibold text-base-content mb-1"><PenSquare size={16} aria-hidden="true" className="inline mr-1" />Manual</p>
            <Text size="xs" className="text-base-content/70">Accedes a la Lectura Interrogativa: lees el texto sección por sección y escribes tus propias preguntas de 3 tipos (conceptos, metodología, combate). Requiere más tiempo pero el esfuerzo de formular preguntas mejora la retención. Luego haces un Descarga de Ideas para consolidar.</Text>
          </div>
          <div className="bg-base-100 rounded-lg p-3 border border-base-content/10">
            <p className="font-semibold text-base-content mb-1"><Bot size={16} aria-hidden="true" className="inline mr-1" />Asistido por IA</p>
            <Text size="xs" className="text-base-content/70">La IA genera preguntas automáticamente para todas las secciones. Tú las revisas, editas o descartas antes de continuar. Si alguna sección te interesa más, puedes cambiarte a modo manual para esa sección en concreto. El costo es mínimo (o gratis con Gemini).</Text>
          </div>
          <Text size="xs" className="text-base-content/50 text-center">Ambos modos terminan en Descarga de Ideas y luego Cuestionario. La única diferencia es cómo se generan las preguntas.</Text>
        </div>
      </details>

      {/* ── Generate button (AI mode) ────────────────────────────────────── */}
      {mode === 'ai' && !genDone && (
        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={generating || notes.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-content hover:opacity-90 disabled:from-base-300 disabled:to-base-300 disabled:cursor-not-allowed transition-[background,box-shadow] shadow-lg"
          style={{ minHeight: 'var(--touch-target-min)' }}
        >
          {generating ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Generando preguntas… {genProgress.current}/{genProgress.total}
            </>
          ) : (
            <>
              <Sparkles size={18} aria-hidden="true" />
              Generar preguntas con IA ({notes.length} secciones)
            </>
          )}
        </button>
      )}

      {/* ── Generation progress ──────────────────────────────────────────── */}
      {generating && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-primary mb-2">
            <span>Generando preguntas…</span>
            <span>{genProgress.current}/{genProgress.total}</span>
          </div>
          <div className="w-full h-2 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-300"
              style={{ width: `${(genProgress.current / (genProgress.total || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Generation done ──────────────────────────────────────────────── */}
      {genDone && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-2">
          <Check size={18} aria-hidden="true" className="text-success" />
          <Text size="sm" className="text-success font-medium">
            Preguntas generadas para todas las secciones. ¡Ya puedes empezar!
          </Text>
        </div>
      )}

      {/* ── Start button ─────────────────────────────────────────────────── */}
      {(mode === 'manual' || genDone) && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-base-100 via-base-100 to-transparent">
          <Button
            color="primary"
            size="lg"
            className="w-full max-w-3xl mx-auto"
            onClick={handleStart}
            disabled={sections.length === 0}
          >
            <Play size={18} aria-hidden="true" />
            {mode === 'ai' ? 'Revisar preguntas y empezar' : 'Empezar a estudiar'}
            <ChevronRight size={20} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
