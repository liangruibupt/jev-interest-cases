import type { Passage } from "./corpus";

const STOPWORDS = new Set(["a", "an", "the", "is", "are", "be", "been", "to", "of", "in", "on", "for", "and", "or", "not", "it", "its", "this", "that", "with", "as", "by", "at", "from", "do", "does", "i", "my", "we", "you", "how", "what", "which", "when", "if", "then", "than", "they", "their", "there", "here", "all", "any", "also", "into", "about", "so", "have", "has", "had", "will", "would", "every"]);

export const K1 = 1.5;
export const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface IndexedDoc {
  id: string;
  tf: Map<string, number>;
  len: number;
}

export interface Bm25Index {
  docs: IndexedDoc[];
  df: Map<string, number>;
  avgdl: number;
}

/** Deterministic in-memory BM25 (k1 1.5, b 0.75) over title + text. */
export function buildIndex(passages: Passage[]): Bm25Index {
  const docs: IndexedDoc[] = passages.map((p) => {
    const tf = new Map<string, number>();
    const tokens = tokenize(`${p.title} ${p.text}`);
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: p.id, tf, len: tokens.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgdl = docs.length ? docs.reduce((s, d) => s + d.len, 0) / docs.length : 0;
  return { docs, df, avgdl };
}

export function search(index: Bm25Index, query: string, k = 10): { id: string; score: number }[] {
  const terms = [...new Set(tokenize(query))].filter((t) => index.df.has(t));
  if (terms.length === 0) return [];
  const N = index.docs.length;
  const scored = index.docs
    .map((d) => {
      let score = 0;
      for (const t of terms) {
        const tf = d.tf.get(t) ?? 0;
        if (tf === 0) continue;
        const df = index.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = tf + K1 * (1 - B + (B * d.len) / (index.avgdl || 1));
        score += idf * ((tf * (K1 + 1)) / norm);
      }
      return { id: d.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return scored.slice(0, k).map((s) => ({ id: s.id, score: Number(s.score.toFixed(4)) }));
}
