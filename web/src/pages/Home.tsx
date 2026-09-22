import { Link } from "react-router";
import { SCENARIOS } from "../app/scenarios";
import { zh } from "../i18n/zh";

export function Home() {
  return (
    <div className="rise mx-auto max-w-5xl">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl leading-tight">
          Jev 不生成文字，<span className="text-jev">只给代码一个校准过的数字</span>。
        </h1>
        <p className="mt-4 text-ink-2">
          Jev 是 TypeSafe 的 System One 模型：接收一个 state 和一组类型化问题（Choice / Score / Noul），约 100 毫秒返回概率分布与置信度，
          输入 $0.042/Mtok、输出免费。下面 8 个场景按学习路径排列；每个场景都会展示发给 Jev 的原始问题、返回的概率、延迟与费用，以及
          "如果用 LLM 做同样的事"的成本基线。
        </p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SCENARIOS.map((s, i) => (
          <Link key={s.id} to={s.path} className="hairline group rounded-md bg-panel p-4 transition-colors hover:border-jev/50">
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="num text-[10px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-lg">{s.title}</span>
              </div>
              <span className={`num text-[10px] ${s.group === "hybrid" ? "text-claude" : "text-jev"}`}>{zh.group[s.group]}</span>
            </div>
            <div className="mt-1 text-sm text-ink-2">{s.subtitle}</div>
            <div className="mt-2 text-xs text-ink-3">证明：{s.proves}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
