import { useNavigate, useParams } from 'react-router-dom';

/**
 * ModeSwitch — tab bar toggling between study modes within a section.
 *
 * Switches the current route between:
 *   - Lectura Interrogativa → /session/:id/section/:sectionId/read
 *   - Brain Dump            → /session/:id/section/:sectionId/brain-dump
 *
 * Both tabs share the same route params; only the last path segment changes.
 *
 * @param {object} props
 * @param {'read'|'brain-dump'} props.activeMode - Currently active mode
 */
export default function ModeSwitch({ activeMode }) {
  const { id: sessionId, sectionId } = useParams();
  const navigate = useNavigate();

  const tabs = [
    {
      key: 'read',
      label: 'Lectura Interrogativa',
    },
    {
      key: 'brain-dump',
      label: 'Descarga de Ideas',
    },
  ];

  const handleSwitch = (key) => {
    if (key === activeMode) return;
    navigate(
      `/session/${sessionId}/section/${sectionId}/${key}`,
      { replace: true },
    );
  };

  return (
    <div
      className="flex rounded-lg bg-base-200 p-1"
      role="tablist"
      aria-label="Modo de estudio"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeMode;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSwitch(tab.key)}
            className={`
              flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors
              ${isActive
                ? 'bg-base-100 text-primary shadow-sm'
                : 'text-base-content/50 hover:text-base-content'
              }
            `}
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
