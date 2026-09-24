import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, children }) {
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      className={`modal-backdrop${open ? '' : ' hidden'}`}
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <section className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose}>×</button>
        {children}
      </section>
    </div>
  );
}
