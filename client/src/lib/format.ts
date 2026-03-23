export const safeText = (value: unknown, fallback = "—") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized ? normalized : fallback;
};

export const safeNumber = (value: unknown, fallback = 0) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export const safeInteger = (value: unknown, fallback = 0) => {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
};

export const safeCurrency = (value: unknown, fallback = "$0.00") => {
  const normalized = safeNumber(value, Number.NaN);

  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return `$${normalized.toFixed(2)}`;
};

export const safeDateTime = (value: unknown, fallback = "Fecha no disponible") => {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleString();
};

export const safeArray = <T,>(value: T[] | null | undefined) => {
  return Array.isArray(value) ? value : [];
};

export const safeTitle = (value: unknown, fallback = "Sin datos") => {
  return safeText(value, fallback);
};

export const getStockTone = (currentStock: unknown, minimumStock: unknown) => {
  const current = Math.max(0, safeNumber(currentStock, 0));
  const minimum = Math.max(0, safeNumber(minimumStock, 0));

  if (current <= minimum) {
    return "critical" as const;
  }

  if (minimum > 0 && current <= minimum * 1.5) {
    return "low" as const;
  }

  return "healthy" as const;
};

export const getStockProgress = (currentStock: unknown, minimumStock: unknown) => {
  const current = Math.max(0, safeNumber(currentStock, 0));
  const minimum = Math.max(0, safeNumber(minimumStock, 0));
  const target = minimum > 0 ? minimum * 2 : Math.max(current, 1);
  const progress = target > 0 ? (current / target) * 100 : 0;

  return Math.max(8, Math.min(100, Math.round(progress)));
};
