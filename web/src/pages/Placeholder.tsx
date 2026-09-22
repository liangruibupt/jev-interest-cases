import { useParams } from "react-router";
import { SCENARIOS } from "../app/scenarios";

export function Placeholder() {
  const { id } = useParams();
  const meta = SCENARIOS.find((s) => s.id === id);
  return (
    <div className="rise mx-auto max-w-3xl rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center">
      <div className="font-display text-2xl">{meta?.title ?? id}</div>
      <p className="mt-2 text-ink-2">{meta?.subtitle}</p>
      <p className="mt-4 text-sm text-ink-3">该场景尚在规划中。证明点：{meta?.proves}</p>
    </div>
  );
}
