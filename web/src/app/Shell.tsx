import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CostMeter } from "../components/CostMeter";
import { zh } from "../i18n/zh";
import { SCENARIOS } from "./scenarios";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex items-center gap-3 border-b border-rule bg-panel px-4 py-3 lg:hidden">
        <NavLink to="/" className="font-display shrink-0 text-lg">Jev Lab</NavLink>
        <select aria-label="场景" value={SCENARIOS.some(s => s.path === location.pathname) ? location.pathname : "/"} onChange={e => navigate(e.target.value)} className="min-w-0 flex-1 rounded-sm border border-rule bg-panel px-2 py-2 text-xs">
          <option value="/">总览</option>
          {SCENARIOS.map(s => <option key={s.id} value={s.path}>{s.title}</option>)}
        </select>
      </div>
      <aside className="hidden w-72 shrink-0 flex-col border-r border-rule bg-panel/80 backdrop-blur lg:flex">
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
        <header className="flex items-center justify-end overflow-x-auto border-b border-rule bg-panel/70 px-4 py-2 backdrop-blur sm:px-6">
          <CostMeter />
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
