import type { Questions } from "../../types";

/** Two questions per surviving claim: a three-way relation and a quote-level cross-check. */
export const B2_QUESTIONS: Questions = {
  relation: {
    type: "choice",
    instructions: "How does `section.text` relate to `claim`?",
    criteria: {
      supports: "The section states the claim or directly implies that it is true",
      contradicts: "The section states the opposite of the claim or implies it is false",
      says_nothing: "The section does not address what the claim asserts, either way",
    },
  },
  quote_supports: {
    type: "noul",
    instructions: "Read in the context of `section.text`, does `quote` state or directly imply `claim`?",
  },
};

export const buildClaimState = (claim: string, section: { id: string; title: string; text: string }, quote: string) => ({ claim, section, quote });
