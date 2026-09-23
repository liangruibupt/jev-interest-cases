/** Only the message and the last two user turns; nothing else is needed by the ten questions. */
export function buildMessageState(text: string, recent: string[] = []) {
  return { message: text, recent_context: recent.slice(-2) };
}
