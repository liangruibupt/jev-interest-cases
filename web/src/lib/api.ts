export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: { status: number; code: string; message: string; detail?: unknown } };
  if (!res.ok) {
    const e = body.error ?? { status: res.status, code: "http", message: res.statusText };
    throw new ApiError(e.status, e.code, e.message, e.detail);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => fetch(path).then(handle<T>),
  post: <T>(path: string, json: unknown) =>
    fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) }).then(handle<T>),
};
