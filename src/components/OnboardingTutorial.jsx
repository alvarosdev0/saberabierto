import { useState, useEffect } from 'react';
import { BookOpen, Upload, RefreshCw, Sparkles, ChevronRight, ChevronLeft, X, Check } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';

const LS_TUTORIAL_DONE = 'sa:tutorial:done';

const STEPS = [
  {
    icon: BookOpen,
    title: 'Bienvenido a SaberAbierto',
    description:
      'Tu herramienta de estudio personal. Aprende con la metodología Dot Dager: extrae texto de PDFs, genera preguntas, y repasa con el algoritmo SM-2.',
    color: 'bg-primary',
  },
  {
    icon: Upload,
    title: 'Sube tu PDF',
    description:
      'Carga cualquier PDF de estudio. Selecciona las páginas que quieras leer y extrae el texto automáticamente. Funciona sin conexión.',
    color: 'bg-blue-500',
  },
  {
    icon: BookOpen,
    title: 'Lee y haz preguntas',
    description:
      'El texto se divide en secciones. Para cada sección, responde preguntas clave, metodológicas y desafiantes.       Luego haz un descarga de ideas con tus notas.',
    color: 'bg-success',
  },
  {
    icon: RefreshCw,
    title: 'Repaso espaciado',
    description:
      'Crea cuestionarios y el algoritmo SM-2 programa repasos automáticos. Marca tu nivel de recuerdo (0-3) y el sistema optimiza cuándo repasar cada pregunta.',
    color: 'bg-warning',
  },
  {
    icon: Sparkles,
    title: 'IA opcional',
    description:
      'Conecta tu API key de Gemini, OpenAI, DeepSeek o Anthropic para acelerar la creación de preguntas. La app funciona completa sin IA — tú decides.',
    color: 'bg-pink-500',
  },
];

export default function OnboardingTutorial() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(LS_TUTORIAL_DONE);
    if (!done) {
      // Small delay so the app loads first
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const goTo = (next) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 150);
  };

  const finish = () => {
    localStorage.setItem(LS_TUTORIAL_DONE, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-base-100 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={finish}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-base-content/40 hover:text-base-content/70 hover:bg-base-200 transition-colors"
          style={{ minWidth: '44px', minHeight: '44px' }}
          aria-label="Cerrar tutorial"
        >
          <X size={20} />
        </button>

        {/* Step content */}
        <div
          className={`flex flex-col items-center text-center p-8 pt-12 transition-opacity duration-150 ${animating ? 'opacity-0' : 'opacity-100'}`}
        >
          {/* Icon circle */}
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${current.color} shadow-lg`}
          >
            <Icon size={40} className="text-white" />
          </div>

          {/* Step indicator */}
          <div className="flex gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  i === step
                    ? 'bg-primary w-6'
                    : i < step
                      ? 'bg-primary/30'
                      : 'bg-base-300'
                }`}
              />
            ))}
          </div>

          {/* Title */}
          <Heading as="h2" size="lg" className="text-base-content mb-2">{current.title}</Heading>

          {/* Description */}
          <Text size="sm" className="text-base-content/70 leading-relaxed">{current.description}</Text>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          {/* Skip / Back */}
          {isFirst ? (
            <button
              type="button"
              onClick={finish}
              className="px-4 py-2 text-sm text-base-content/50 hover:text-base-content transition-colors"
              style={{ minHeight: '44px' }}
            >
              Saltar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-base-content/70 hover:text-base-content transition-colors"
              style={{ minHeight: '44px' }}
            >
              <ChevronLeft size={18} />
              Atrás
            </button>
          )}

          {/* Next / Finish */}
          {isLast ? (
            <Button
              color="primary"
              onClick={finish}
            >
              <Check size={18} />
              ¡Empezar!
            </Button>
          ) : (
            <Button
              color="primary"
              onClick={() => goTo(step + 1)}
            >
              Siguiente
              <ChevronRight size={18} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
