import { RFC7519_TEXT } from "../../datasets/rfc7519";

export interface RfcSection {
  /** e.g. "4.1.4" */
  id: string;
  /** e.g. '"exp" (Expiration Time) Claim' */
  title: string;
  /** Body text with page headers/footers removed and blank runs collapsed. */
  text: string;
}

const HEADING = /^(\d+(?:\.\d+)*)\.\s{2,}(\S.*)$/;
const PAGE_NOISE = /^(Jones, et al\.|RFC 7519\s+JSON Web Token \(JWT\)\s+May 2015)|^\f/;

/** Split an RFC text into numbered sections. Table-of-contents lines carry dot leaders and are skipped. */
export function parseRfcSections(text: string): RfcSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const heads: { idx: number; id: string; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = HEADING.exec(line);
    if (!m || /\. \. \./.test(line)) continue;
    heads.push({ idx: i, id: m[1]!, title: m[2]!.trim() });
  }
  return heads.map((h, k) => {
    const end = heads[k + 1]?.idx ?? lines.length;
    const body = lines
      .slice(h.idx + 1, end)
      .filter((l) => !PAGE_NOISE.test(l))
      .map((l) => l.replace(/^ {3}/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { id: h.id, title: h.title, text: body };
  });
}

export const RFC_SECTIONS: RfcSection[] = parseRfcSections(RFC7519_TEXT);

export const sectionById = (id: string): RfcSection | undefined => RFC_SECTIONS.find((s) => s.id === id);

/** Sections 1–12 (normative body) as Markdown for the answering model; references and appendices are dropped. */
export function rfcBodyForPrompt(): string {
  return RFC_SECTIONS.filter((s) => Number(s.id.split(".")[0]) <= 12)
    .map((s) => `## ${s.id}  ${s.title}\n\n${s.text}`)
    .join("\n\n");
}
