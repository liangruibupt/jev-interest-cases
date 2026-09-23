/**
 * Fixed-order categorical palette (dataviz reference instance, light mode), validated with the
 * dataviz validator against the panel surface #fffdf9. Labels take colours by first appearance
 * within a question so the same label has the same colour in every arm's heatmap.
 */
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
export const OTHER_GRAY = "#8a857c";

export function labelColorMap(labelsInOrder: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  let i = 0;
  for (const l of labelsInOrder) {
    if (map[l]) continue;
    map[l] = i < CATEGORICAL.length ? CATEGORICAL[i]! : OTHER_GRAY;
    i++;
  }
  return map;
}
