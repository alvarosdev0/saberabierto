import { useRef, useState, useCallback } from 'react';

/**
 * Drag & drop zone for PDF files with a fallback file picker.
 *
 * Accepts .pdf files only. Shows the file name and size after selection.
 * Rejects non-PDF files with a visible error message.
 *
 * @param {object} props
 * @param {(file: File) => void} props.onFileSelected - Called when a valid PDF is selected
 */
export default function FileDropzone({ onFileSelected }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);

  const validateAndAccept = useCallback(
    (file) => {
      setError(null);

      if (!file) return;

      if (
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        setError('Solo archivos PDF (.pdf)');
        return;
      }

      setSelectedFile(file);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer?.files?.[0];
      validateAndAccept(file);
    },
    [validateAndAccept],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      validateAndAccept(file);
    },
    [validateAndAccept],
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  /**
   * Format file size to human-readable string.
   * @param {number} bytes
   * @returns {string}
   */
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        aria-label="Seleccionar archivo PDF"
        className={`
          relative flex flex-col items-center justify-center gap-3 p-8
          border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-150 text-center
          ${dragOver
            ? 'border-purple-400 bg-purple-50 scale-[1.02]'
            : selectedFile
              ? 'border-green-300 bg-green-50'
              : 'border-gray-300 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/50'
          }
        `}
        style={{ minHeight: '160px' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
        />

        {selectedFile ? (
          <>
            {/* File accepted state */}
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-semibold text-gray-800">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatSize(selectedFile.size)}</p>
            </div>
            <p className="text-xs text-gray-400">
              Haz clic o arrastra otro archivo para cambiar
            </p>
          </>
        ) : (
          <>
            {/* Empty state */}
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <p className="font-semibold text-gray-700">
                Arrastra un PDF aquí
              </p>
              <p className="text-sm text-gray-500">o haz clic para seleccionar</p>
            </div>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="px-4 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Cerrar error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
