import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/community/event-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "이벤트 만들기 - Audax Korea",
};

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }
  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (!isAdmin) {
    redirect("/community/events");
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">공식 이벤트 등록</h2>
      <EventForm />
    </div>
  );
}
