import { NavLink, Outlet } from "react-router";
import { CostMeter } from "../components/CostMeter";
import { zh } from "../i18n/zh";
import { SCENARIOS } from "./scenarios";

export function Shell() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-rule bg-panel/80 backdrop-blur">
        <NavLink to="/" className="block border-b border-rule px-5 py-5">
          <div className="font-display text-2xl leading-none">{zh.app.title}</div>
          <div className="mt-1 text-xs text-ink-3">{zh.app.subtitle}</div>
        </NavLink>
        <div className="px-5 pt-5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">{zh.nav.learningPath}</div>
        <nav className="mt-2 flex-1 space-y-px px-3">
          {SCENARIOS.map((s, i) => (
            <NavLink
              key={s.id}
              to={s.path}
              className={({ isActive }) =>
                `group block rounded-sm px-2 py-2 transition-colors ${isActive ? "bg-jev-soft" : "hover:bg-paper-2"}`
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="num w-5 text-[10px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 text-sm">{s.title}</span>
                <span className={`num text-[10px] ${s.status === "available" ? "text-ok" : "text-ink-3"}`}>{zh.status[s.status]}</span>
              </div>
              <div className="pl-7 text-xs text-ink-3">{s.subtitle}</div>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-rule px-5 py-3 text-[10px] text-ink-3">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-jev align-middle" /> Jev
          <span className="ml-4 mr-2 inline-block h-2 w-2 rounded-full bg-claude align-middle" /> Claude
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-rule bg-panel/70 px-6 py-2 backdrop-blur">
          <CostMeter />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
