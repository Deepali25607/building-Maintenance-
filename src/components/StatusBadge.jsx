const COLORS = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  partial: "bg-blue-100 text-blue-700",
  open: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-700",
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-700",
};

export default function StatusBadge({ value }) {
  const cls = COLORS[value] || "bg-slate-100 text-slate-700";
  return <span className={`badge ${cls}`}>{String(value || "").replace(/_/g, " ")}</span>;
}
