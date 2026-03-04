import { prisma } from "./db";

/**
 * Resolve a keycloak ID to the database user UUID.
 * Returns null if user not found.
 */
async function resolveUserId(keycloakId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { keycloakId },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Log an admin action to the audit log.
 * Accepts keycloak ID (from session.user.id) and resolves to DB user ID.
 * Fire-and-forget — errors are logged but never thrown.
 */
export function logAuditAction(
  keycloakIdOrUserId: string,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  details?: Record<string, unknown> | null,
  ipHash?: string | null
) {
  resolveUserId(keycloakIdOrUserId)
    .then((dbUserId) => {
      if (!dbUserId) {
        console.error("[audit] Could not resolve user for keycloak ID:", keycloakIdOrUserId);
        return;
      }
      return prisma.auditLog.create({
        data: {
          userId: dbUserId,
          action,
          targetType: targetType ?? null,
          targetId: targetId ?? null,
          details: details ?? undefined,
          ipHash: ipHash ?? null,
        },
      });
    })
    .catch((err) => {
      console.error("[audit] Failed to log action:", action, err);
    });
}

/** Action type constants */
export const AUDIT_ACTIONS = {
  COURSE_CREATE: "course_create",
  COURSE_UPDATE: "course_update",
  COURSE_DELETE: "course_delete",
  COURSE_ARCHIVE: "course_archive",
  USER_BAN: "user_ban",
  USER_MUTE: "user_mute",
  USER_ACTIVATE: "user_activate",
  SETTINGS_UPDATE: "settings_update",
  SCRAPER_RUN: "scraper_run",
  BACKUP_CREATE: "backup_create",
  BACKUP_RESTORE: "backup_restore",
} as const;

/** Korean labels for action types */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  course_create: "코스 생성",
  course_update: "코스 수정",
  course_delete: "코스 삭제",
  course_archive: "코스 보관",
  user_ban: "유저 정지",
  user_mute: "유저 음소거",
  user_activate: "유저 활성화",
  settings_update: "설정 변경",
  scraper_run: "스크래퍼 실행",
  backup_create: "백업 생성",
  backup_restore: "백업 복원",
};
