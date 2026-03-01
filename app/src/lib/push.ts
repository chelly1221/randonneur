import webpush from "web-push";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  let mailto = "mailto:admin@audax.3chan.kr";
  try {
    mailto = `mailto:admin@${new URL(NEXTAUTH_URL).hostname}`;
  } catch {
    // Fall back to default if NEXTAUTH_URL is not a valid URL
  }
  webpush.setVapidDetails(mailto, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send push notification to all admin users' subscriptions.
 * Expired/invalid subscriptions are automatically removed.
 */
export async function sendAdminNotification(
  type: string,
  body: string,
  url?: string
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured, skipping push notification");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: "admin" } },
  });

  if (subscriptions.length === 0) return;

  const titleMap: Record<string, string> = {
    report: "신고 접수",
    improvement: "수정 요청",
    photo: "CP 사진 제출",
  };

  const urlMap: Record<string, string> = {
    report: "/admin/reports",
    improvement: "/admin/improvement-requests",
    photo: "/admin/checkpoint-photos",
  };

  const payload: NotificationPayload = {
    title: titleMap[type] || "Audax 3chan",
    body,
    url: url || urlMap[type] || "/admin",
    tag: type,
  };

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    )
  );

  // Clean up expired subscriptions (410 Gone or 404 Not Found)
  const toDelete: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        toDelete.push(subscriptions[i].id);
      } else {
        console.error(
          `Push failed for subscription ${subscriptions[i].id}:`,
          result.reason
        );
      }
    }
  });

  if (toDelete.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: toDelete } },
      });
    } catch (err) {
      console.error("Failed to clean up expired subscriptions:", err);
    }
  }
}
