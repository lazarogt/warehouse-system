export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const normalizeApiBaseUrl = (apiBaseUrl: string) => {
  const trimmed = apiBaseUrl.trim();

  if (!trimmed) {
    return "/api";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

export const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL;

  if (typeof configured === "string" && configured.trim()) {
    return normalizeApiBaseUrl(configured);
  }

  return "/api";
};

type DownloadResult = {
  blob: Blob;
  filename: string;
};

const extractFilename = (headerValue: string | null) => {
  if (!headerValue) {
    return "download";
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const standardMatch = headerValue.match(/filename="?([^"]+)"?/i);
  return standardMatch?.[1] ?? "download";
};

export const createApiClient = (apiBaseUrl: string) => {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl);

  const request = async <T,>(path: string, init?: RequestInit) => {
    let response: Response;

    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        ...init,
      });
    } catch {
      throw new ApiError(
        "No se pudo conectar con el servidor. Verifica la API y vuelve a intentarlo.",
        0,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }

      let message = `Request failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as { message?: string };
        message = payload.message ?? message;
      } catch {
        message = `Request failed with status ${response.status}`;
      }

      throw new ApiError(message, response.status);
    }

    return (await response.json()) as T;
  };

  const download = async (path: string): Promise<DownloadResult> => {
    let response: Response;

    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        "No se pudo conectar con el servidor. Verifica la API y vuelve a intentarlo.",
        0,
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }

      let message = `Request failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as { message?: string };
        message = payload.message ?? message;
      } catch {
        message = `Request failed with status ${response.status}`;
      }

      throw new ApiError(message, response.status);
    }

    return {
      blob: await response.blob(),
      filename: extractFilename(response.headers.get("content-disposition")),
    };
  };

  return {
    get: <T,>(path: string) => request<T>(path),
    post: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    put: <T,>(path: string, body: unknown) =>
      request<T>(path, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    patch: <T,>(path: string, body: unknown) =>
      request<T>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (path: string) =>
      request<void>(path, {
        method: "DELETE",
      }),
    download,
  };
};

export const saveDownloadedFile = ({ blob, filename }: DownloadResult) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};
