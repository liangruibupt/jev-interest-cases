export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  onError?: (err: Event) => void;
}

/** Thin EventSource wrapper: subscribes to the named events the A4 route emits. */
export function openSse(url: string, events: string[], handlers: SseHandlers): () => void {
  const es = new EventSource(url);
  for (const ev of events) {
    es.addEventListener(ev, (e) => {
      const msg = e as MessageEvent<string>;
      try {
        handlers.onEvent(ev, JSON.parse(msg.data));
      } catch {
        handlers.onEvent(ev, msg.data);
      }
    });
  }
  es.onerror = (e) => handlers.onError?.(e);
  return () => es.close();
}
