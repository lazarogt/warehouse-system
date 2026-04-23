import { es } from "./es";

type DictionaryValue = string | DictionaryMap;

type DictionaryMap = {
  [key: string]: DictionaryValue;
};

const dictionary = es satisfies Record<string, DictionaryValue>;

function resolveKey(source: Record<string, DictionaryValue>, key: string): string | null {
  const segments = key.split(".");
  let current: DictionaryValue | undefined = source;

  for (const segment of segments) {
    if (!current || typeof current === "string" || !(segment in current)) {
      return null;
    }

    current = current[segment] as DictionaryValue;
  }

  return typeof current === "string" ? current : null;
}

export function t(key: string): string {
  return resolveKey(dictionary, key) ?? key;
}

const userRoleKeyMap = {
  admin: "roles.admin",
  manager: "roles.manager",
  operator: "roles.operator",
} as const;

const userStatusKeyMap = {
  active: "userStatus.active",
  inactive: "userStatus.inactive",
} as const;

const movementTypeKeyMap = {
  entry: "movementTypes.entry",
  exit: "movementTypes.exit",
} as const;

const transferStatusKeyMap = {
  approved: "transferStatus.approved",
  cancelled: "transferStatus.cancelled",
  completed: "transferStatus.completed",
  pending: "transferStatus.pending",
} as const;

const cycleCountStatusKeyMap = {
  cancelled: "cycleCountStatus.cancelled",
  completed: "cycleCountStatus.completed",
  draft: "cycleCountStatus.draft",
  in_progress: "cycleCountStatus.in_progress",
} as const;

const adjustmentTypeKeyMap = {
  correction: "adjustmentTypes.correction",
  decrease: "adjustmentTypes.decrease",
  increase: "adjustmentTypes.increase",
} as const;

const warehouseLocationTypeKeyMap = {
  aisle: "locationTypes.aisle",
  bin: "locationTypes.bin",
  other: "locationTypes.other",
  rack: "locationTypes.rack",
  shelf: "locationTypes.shelf",
  staging: "locationTypes.staging",
  zone: "locationTypes.zone",
} as const;

const categoryAttributeTypeKeyMap = {
  boolean: "attributeTypes.boolean",
  date: "attributeTypes.date",
  json: "attributeTypes.json",
  multiselect: "attributeTypes.multiselect",
  number: "attributeTypes.number",
  select: "attributeTypes.select",
  text: "attributeTypes.text",
} as const;

function translateMappedKey<T extends Record<string, string>>(value: string, map: T): string {
  return value in map ? t(map[value as keyof T]) : value;
}

export function tUserRole(role: string): string {
  return translateMappedKey(role, userRoleKeyMap);
}

export function tUserStatus(status: string): string {
  return translateMappedKey(status, userStatusKeyMap);
}

export function tMovementType(type: string): string {
  return translateMappedKey(type, movementTypeKeyMap);
}

export function tTransferStatus(status: string): string {
  return translateMappedKey(status, transferStatusKeyMap);
}

export function tCycleCountStatus(status: string): string {
  return translateMappedKey(status, cycleCountStatusKeyMap);
}

export function tAdjustmentType(type: string): string {
  return translateMappedKey(type, adjustmentTypeKeyMap);
}

export function tWarehouseLocationType(type: string): string {
  return translateMappedKey(type, warehouseLocationTypeKeyMap);
}

export function tCategoryAttributeType(type: string): string {
  return translateMappedKey(type, categoryAttributeTypeKeyMap);
}

export { es };
