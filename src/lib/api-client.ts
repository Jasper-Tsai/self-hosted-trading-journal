async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return parseResponse<T>(await fetch(path));
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return parseResponse<T>(await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return parseResponse<T>(await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return parseResponse<T>(await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  return parseResponse<T>(await fetch(path, { method: 'DELETE' }));
}
