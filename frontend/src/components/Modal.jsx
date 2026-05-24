export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
