import { randomUUID } from "node:crypto";

export const newTraceId = (): string => randomUUID();
