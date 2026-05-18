"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user/user-avatar";
import { Camera, Save, ArrowLeft, Bike, ChevronRight } from "lucide-react";
import Link from "next/link";

interface UserProfile {
  id: string;
  displayName: string;
  bio: string | null;
  avatarKey: string | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [bioValue, setBioValue] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [bikeCount, setBikeCount] = useState(0);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setBioValue(data.bio ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/bikes")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setBikeCount(data.length);
      })
      .catch(() => {});
  }, []);

  if (!session) return null;

  async function handleBioSave() {
    setSavingBio(true);
    setBioSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bioValue }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile((p) => (p ? { ...p, bio: updated.bio } : p));
        setBioSaved(true);
        setTimeout(() => setBioSaved(false), 2000);
      }
    } finally {
      setSavingBio(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarSaved(false);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((p) => (p ? { ...p, avatarKey: data.avatarKey } : p));
        setAvatarSaved(true);
        setTimeout(() => setAvatarSaved(false), 2000);
      }
    } finally {
      setUploadingAvatar(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/profile"
          className="rounded-md p-1.5 text-t-muted hover:bg-t-hover hover:text-t-text transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">설정</h1>
      </div>

      {/* Profile Picture */}
      <Card className="mb-4">
        <CardContent>
          <h2 className="mb-4 text-sm font-semibold text-t-muted uppercase tracking-wide">
            프로필 사진
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar
                displayName={session.user.name ?? "U"}
                avatarKey={profile?.avatarKey}
                size="lg"
              />
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-sky-darkblue text-white hover:bg-sky-darkblue/80 transition-colors">
                {uploadingAvatar ? (
                  <span className="text-xs">...</span>
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>
            <div className="text-sm text-t-muted">
              <p>JPG, PNG, WebP 형식</p>
              <p>최대 2MB</p>
              {avatarSaved && (
                <p className="mt-1 text-green-600 font-medium">저장되었습니다</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card className="mb-4">
        <CardContent>
          <h2 className="mb-4 text-sm font-semibold text-t-muted uppercase tracking-wide">
            자기소개
          </h2>
          <textarea
            value={bioValue}
            onChange={(e) => setBioValue(e.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-t-border bg-t-surface p-3 text-sm text-t-text resize-none focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
            rows={4}
            placeholder="자기소개를 입력하세요..."
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-t-faint">
              {bioValue.length}/500
            </span>
            <div className="flex items-center gap-2">
              {bioSaved && (
                <span className="text-xs text-green-600 font-medium">저장되었습니다</span>
              )}
              <button
                onClick={handleBioSave}
                disabled={savingBio || bioValue === (profile?.bio ?? "")}
                className="flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm text-white hover:bg-sky-darkblue/80 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {savingBio ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="mb-4">
        <CardContent>
          <h2 className="mb-4 text-sm font-semibold text-t-muted uppercase tracking-wide">
            계정 정보
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-t-faint">이름</label>
              <p className="text-sm">{session.user.name ?? "-"}</p>
            </div>
            <div>
              <label className="text-xs text-t-faint">이메일</label>
              <p className="text-sm">{session.user.email ?? "-"}</p>
            </div>
            <p className="text-xs text-t-faint">
              이름과 이메일은 로그인한 소셜 계정(Google·네이버)에서 관리됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* My Bikes */}
      <Link href="/settings/bikes">
        <Card className="group cursor-pointer hover:border-sky-blue/50 transition-colors">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-blue/10 text-sky-blue">
                  <Bike className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-t-text">내 자전거</h2>
                  <p className="text-xs text-t-muted">
                    {bikeCount > 0
                      ? `${bikeCount}대 등록됨`
                      : "자전거를 등록해보세요"}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-t-faint group-hover:text-t-muted transition-colors" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
