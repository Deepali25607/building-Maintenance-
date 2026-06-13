// Ambient, premium backdrop shared by the Login and Signup (create-org) pages.
// Soft floating gold glow orbs + a faint dot-grid texture + a top sheen, all
// behind the form card. Purely decorative — pointer-events disabled.
export default function AuthBackground({ children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-page to-brand-100 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Floating gold glow orbs */}
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-28 h-[30rem] w-[30rem] rounded-full bg-accent/20 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-44 left-1/4 h-[28rem] w-[28rem] rounded-full bg-brand-100/50 blur-3xl animate-float" />

        {/* Faint dot-grid texture */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--brand-500) / 0.10) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Soft sheen at the top + gentle vignette */}
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white/50 to-transparent" />
        <div className="absolute inset-0 shadow-[inset_0_0_180px_60px_rgba(60,45,20,0.06)]" />
      </div>

      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
