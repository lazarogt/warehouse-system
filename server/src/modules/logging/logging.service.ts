import { query } from "../../lib/db";

type CriticalEventInput = {
  eventType: string;
  actorUserId?: number | null;
  targetUserId?: number | null;
  targetEntityId?: number | null;
  targetEntityType?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const recordCriticalEvent = (input: CriticalEventInput) => {
  try {
    query(
      `
        INSERT INTO critical_event_logs (
          event_type,
          actor_user_id,
          target_user_id,
          target_entity_id,
          target_entity_type,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [
        input.eventType,
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.targetEntityId ?? null,
        input.targetEntityType ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[critical-event-log.failed]", {
        code: (error as { code?: string } | null)?.code,
        message: error instanceof Error ? error.message : "Unknown logging error",
      });
    }
  }
};
