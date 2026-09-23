import type { Essay, MisconceptionId } from "../../datasets/essays";
import { ASSIGNMENT } from "../../datasets/essays";
import type { Questions } from "../../types";

export const C1_QUESTION_IDS = ["cause_scattering", "sunset_path", "names_rayleigh", "evidence_or_example", "on_topic", "misconception", "overall", "clarity"] as const;

export const MISCONCEPTIONS: readonly MisconceptionId[] = ["none", "reflects_ocean", "air_is_blue", "refraction_not_scattering", "other_misconception"];

/** One request per answer: four rubric Nouls, an on-topic Noul, a misconception Choice and two situational Scores. */
export const C1_QUESTIONS: Questions = {
  cause_scattering: {
    type: "noul",
    instructions: "Does `answer` state that the sky is blue because the atmosphere (air molecules) scatters the shorter, blue wavelengths of sunlight more than the longer ones?",
    criteria: {
      true: "It attributes the blue sky to scattering of shorter or blue light by the air",
      false: "It gives no cause, or a different cause such as reflection, refraction, or the color of the gases",
    },
  },
  sunset_path: {
    type: "noul",
    instructions: "Does `answer` explain that at sunset the light travels a longer path through the atmosphere, so the blue is scattered away and the longer red or orange wavelengths remain?",
    criteria: {
      true: "It links the sunset colors to a longer path through air and blue light being removed",
      false: "It does not explain the sunset, or explains it with a different mechanism",
    },
  },
  names_rayleigh: {
    type: "noul",
    instructions: "Does `answer` name Rayleigh scattering as the process (an obvious misspelling such as 'Raleigh scattering' still counts)?",
  },
  evidence_or_example: {
    type: "noul",
    instructions: "Does `answer` give at least one piece of evidence, observation, or example that supports its explanation of the sky's color?",
    criteria: {
      true: "It offers a supporting observation or example, e.g. the Sun looks yellowish, the sky on Mars or the Moon, a milk-in-water demonstration",
      false: "It only asserts the explanation without any supporting observation or example",
    },
  },
  on_topic: {
    type: "noul",
    instructions: "Is `answer` about why the sky is blue in the day and red or orange at sunset, rather than about a different topic?",
  },
  misconception: {
    type: "choice",
    instructions: "Does `answer` contain a scientifically incorrect claim about the cause of the sky's color? Which one?",
    criteria: {
      none: "No incorrect scientific claim",
      reflects_ocean: "Says the sky is blue because it reflects the ocean, lakes, or water",
      air_is_blue: "Says the air or its gases are themselves blue-colored",
      refraction_not_scattering: "Describes the atmosphere bending light like a prism (refraction) instead of scattering",
      other_misconception: "Another incorrect claim about the cause, e.g. the Sun gets closer or hotter at sunset, or pollution is the main reason",
    },
  },
  overall: {
    type: "score",
    instructions: { question: "How well does `answer` respond to `assignment.prompt`?", focus: "Judge the science content, not spelling or grammar." },
    criteria: ["Off topic, blank, restates the question, or the explanation is mostly incorrect", "Names the phenomenon but the explanation is missing key parts or contains an error", "The explanation is correct with a minor gap, such as no evidence or no name for the process", "Complete and accurate: the cause, the sunset, the process name, and supporting evidence"],
  },
  clarity: {
    type: "score",
    instructions: "How clearly is `answer` written, regardless of whether the science is right?",
    criteria: ["Hard to follow: disorganized, or grammar gets in the way of meaning", "Understandable, with some awkward or unclear sentences", "Clear and well organized"],
  },
};

export function buildEssayState(e: Essay): { assignment: { prompt: string; grade: string }; answer: string } {
  return { assignment: { prompt: ASSIGNMENT.prompt, grade: ASSIGNMENT.grade }, answer: e.text };
}
