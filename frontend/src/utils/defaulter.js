export function defaulterLevel(pendingMonths) {
  const n = Number(pendingMonths || 0);
  if (n > 6) return "severe";
  if (n > 3) return "warning";
  if (n > 0) return "mild";
  return "none";
}

export const TILE_STYLES = {
  severe: "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100",
  warning: "border-orange-300 bg-orange-50 hover:border-orange-400 hover:bg-orange-100",
  mild: "border-slate-200 hover:border-brand-200",
  none: "border-slate-200 hover:border-brand-200",
};

export const BADGE_STYLES = {
  severe: "bg-red-600 text-white",
  warning: "bg-orange-500 text-white",
  mild: "bg-amber-100 text-amber-800",
  none: "",
};

export const LEVEL_LABEL = {
  severe: "Severe defaulter",
  warning: "Defaulter",
  mild: "Has dues",
  none: "",
};
