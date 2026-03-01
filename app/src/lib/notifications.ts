import { prisma } from "./db";

/**
 * Create a notification for a user.
 *
 * @param userId  - The internal (database) UUID of the target user
 * @param type    - Notification type: "comment" | "follow" | "event_reminder" | "like" | "completion"
 * @param title   - Short notification title
 * @param message - Notification body text
 * @param link    - Optional URL the user should be taken to when clicking the notification
 * @returns The created notification, or null if the user does not exist or creation fails
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link: link ?? null,
      },
    });
  } catch (error) {
    // Log but don't crash the caller — foreign key violations (non-existent user) are expected
    // in race conditions (e.g., user deleted between check and notification creation)
    console.error(`Failed to create notification for user ${userId}:`, error);
    return null;
  }
}

/**
 * Create notifications for multiple users at once.
 *
 * @param userIds - Array of internal (database) UUIDs
 * @param type    - Notification type
 * @param title   - Short notification title
 * @param message - Notification body text
 * @param link    - Optional URL
 * @returns The count of created notifications, or null on failure
 */
export async function createNotifications(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  link?: string
) {
  if (userIds.length === 0) return null;

  // Deduplicate userIds to avoid unnecessary rows
  const uniqueUserIds = [...new Set(userIds)];

  try {
    return await prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type,
        title,
        message,
        link: link ?? null,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error(`Failed to create notifications for ${uniqueUserIds.length} users:`, error);
    return null;
  }
}
