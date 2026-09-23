import type { Questions } from "../../types";
import { DEVICES, ROOMS, type HomeState } from "./home";

export const B4_QUESTION_IDS = [
  "category", "is_compound", "room", "device", "light_action", "brightness_level", "color",
  "thermostat_action", "blinds_action", "speaker_action", "tv_action", "lock_action", "mentions_number", "is_question_about_state",
] as const;
export type B4QuestionId = (typeof B4_QUESTION_IDS)[number];

const nulls = (keys: readonly string[]): Record<string, null> => Object.fromEntries(keys.map((k) => [k, null]));

/** All fourteen questions go in one request; most are speculative and only some are used per request. */
export function buildB4Questions(rooms: readonly string[] = ROOMS): Questions {
  return {
    category: {
      type: "choice",
      instructions: "What kind of request is `request`?",
      criteria: {
        device_command: "Asks to change the state of a light, thermostat, blinds, speaker, TV or door lock",
        information_question: "Asks about the current state of the home or a device",
        chit_chat: "Greeting, thanks, or small talk with no home action",
        other: "None of the above",
      },
    },
    is_compound: {
      type: "noul",
      instructions: "Does `request` ask for more than one distinct action, possibly in different rooms?",
      criteria: {
        true: "Two or more separate actions joined by and / then / also, or actions on different devices",
        false: "A single action, even if it applies to several rooms at once",
      },
    },
    room: {
      type: "choice",
      instructions: "Which room does `request` refer to?",
      criteria: { ...nulls(rooms), whole_house: "The whole home, all rooms, or everywhere", not_stated: "No room is named or implied" },
    },
    device: {
      type: "choice",
      instructions: "Which device does `request` want to control or ask about?",
      criteria: { ...nulls(DEVICES), not_stated: "No device is named or implied" },
    },
    light_action: {
      type: "choice",
      instructions: "If `request` is about lights, what should happen?",
      criteria: { turn_on: null, turn_off: null, change_brightness: "Make them brighter, dimmer, or set a level", change_color: null, not_applicable: "The request is not about lights" },
    },
    brightness_level: {
      type: "choice",
      instructions: "If `request` sets a brightness level in words, which one?",
      criteria: { dim: null, medium: null, bright: null, not_stated: "No level in words (a percentage counts as not stated)" },
    },
    color: {
      type: "choice",
      instructions: "If `request` names a light color, which one?",
      criteria: { white: null, warm_white: null, red: null, blue: null, green: null, purple: null, not_stated: "No color is named" },
    },
    thermostat_action: {
      type: "choice",
      instructions: "If `request` is about temperature or heating, what should happen?",
      criteria: { set_specific: "Set to a specific temperature", warmer: "Make it warmer", cooler: "Make it cooler", not_applicable: "The request is not about temperature" },
    },
    blinds_action: {
      type: "choice",
      instructions: "If `request` is about blinds or curtains, what should happen?",
      criteria: { open: null, close: null, not_applicable: "The request is not about blinds" },
    },
    speaker_action: {
      type: "choice",
      instructions: "If `request` is about music or the speaker, what should happen?",
      criteria: { play: null, pause_or_stop: null, volume_up: null, volume_down: null, set_volume: "Set the volume to a specific level", not_applicable: "The request is not about the speaker" },
    },
    tv_action: {
      type: "choice",
      instructions: "If `request` is about the TV, what should happen?",
      criteria: { turn_on: null, turn_off: null, not_applicable: "The request is not about the TV" },
    },
    lock_action: {
      type: "choice",
      instructions: "If `request` is about the front door, what should happen?",
      criteria: { lock: null, unlock: null, not_applicable: "The request is not about the door lock" },
    },
    mentions_number: {
      type: "noul",
      instructions: "Does `request` contain a specific number for a temperature, percentage, or volume level?",
    },
    is_question_about_state: {
      type: "noul",
      instructions: "Is `request` asking what the current state of something is, rather than asking to change it?",
    },
  };
}

export function buildRequestState(request: string, _home: HomeState): { request: string; rooms: string[]; devices: string[] } {
  return { request, rooms: [...ROOMS], devices: [...DEVICES] };
}
