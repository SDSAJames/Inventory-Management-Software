import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, children, size, className = '' }) {
  const startedOnBackdrop = useRef(false);
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size ? `modal-${size}` : '';

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        startedOnBackdrop.current = e.button === 0 && e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        if (e.target !== e.currentTarget) startedOnBackdrop.current = false;
      }}
      onPointerCancel={() => { startedOnBackdrop.current = false; }}
      onClick={(e) => {
        // A drag starting inside the dialog can generate a click on the backdrop.
        const dismiss = startedOnBackdrop.current && e.target === e.currentTarget;
        startedOnBackdrop.current = false;
        if (dismiss) onClose();
      }}
    >
      <section className={`modal ${sizeClass} ${className}`.trim()} role="dialog" aria-modal="true">
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>
        {children}
      </section>
    </div>
  );
}
