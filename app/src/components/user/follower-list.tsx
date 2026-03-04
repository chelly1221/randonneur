"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { UserAvatar } from "@/components/user/user-avatar";
import { FollowButton } from "@/components/user/follow-button";
import { Users, Loader2 } from "lucide-react";

interface UserItem {
  id: string;
  displayName: string;
  avatarKey: string | null;
  bio?: string | null;
}

interface FollowerData {
  followers: UserItem[];
  following: UserItem[];
  followerCount: number;
  followingCount: number;
}

interface FollowerListProps {
  userId: string;
  displayName: string;
  currentUserId: string | null;
  initialFollowingIds: string[];
}

export function FollowerList({
  userId,
  displayName,
  currentUserId,
  initialFollowingIds,
}: FollowerListProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "following" ? "following" : "followers";
  const [activeTab, setActiveTab] = useState<"followers" | "following">(initialTab);
  const [data, setData] = useState<FollowerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/${userId}/followers`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [userId]);

  const tabs = [
    { key: "followers" as const, label: "팔로워", count: data?.followerCount ?? 0 },
    { key: "following" as const, label: "팔로잉", count: data?.followingCount ?? 0 },
  ];

  const users = activeTab === "followers" ? data?.followers : data?.following;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/users/${userId}`}
          className="text-sm text-t-muted hover:text-t-link transition-colors"
        >
          {displayName}
        </Link>
        <h1 className="text-xl font-bold mt-1">
          {activeTab === "followers" ? "팔로워" : "팔로잉"}
        </h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-t-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-sky-darkblue text-t-text"
                : "border-transparent text-t-muted hover:text-t-text"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-t-muted">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-t-muted" />
        </div>
      ) : !users || users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-t-muted">
          <Users className="h-10 w-10 mb-3 text-t-faint" />
          <p className="text-sm">
            {activeTab === "followers"
              ? "아직 팔로워가 없습니다."
              : "아직 팔로잉하는 사용자가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-t-hover transition-colors"
            >
              <Link href={`/users/${user.id}`} className="shrink-0">
                <UserAvatar
                  displayName={user.displayName}
                  avatarKey={user.avatarKey}
                  size="md"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/users/${user.id}`}
                  className="text-sm font-medium hover:text-t-link transition-colors"
                >
                  {user.displayName}
                </Link>
                {user.bio && (
                  <p className="text-xs text-t-muted truncate mt-0.5">
                    {user.bio}
                  </p>
                )}
              </div>
              {currentUserId && currentUserId !== user.id && (
                <div className="shrink-0">
                  <FollowButton
                    userId={user.id}
                    initialFollowing={initialFollowingIds.includes(user.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
