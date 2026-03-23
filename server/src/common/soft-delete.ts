/**
 * Soft-delete semantics across the backend:
 * - is_deleted marks logical removal and excludes rows from active operations.
 * - deleted_at records when the logical removal happened.
 * - active, when present, only represents operational enable/disable state.
 */
export const activeFilter = (alias?: string) => `${alias ? `${alias}.` : ""}is_deleted = FALSE`;
