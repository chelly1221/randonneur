interface UserAvatarProps {
  displayName: string;
  avatarKey?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserAvatar({ displayName, avatarKey, size = "sm", className }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-xl",
  };

  const initial = displayName.charAt(0).toUpperCase();

  if (avatarKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/images/${encodeURIComponent(avatarKey)}`}
        alt={displayName}
        className={`rounded-full object-cover ${sizeClasses[size]} ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-sky-darkblue text-white font-medium ${sizeClasses[size]} ${className ?? ""}`}
    >
      {initial}
    </div>
  );
}
