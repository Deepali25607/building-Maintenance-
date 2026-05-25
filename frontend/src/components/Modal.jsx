export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none -mt-1">&times;</button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="p-4 sm:p-6 pt-3 sm:pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
