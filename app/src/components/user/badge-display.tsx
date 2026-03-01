interface BadgeData {
  slug: string;
  name: string;
  icon: string;
  description: string;
  earnedAt?: string;
}

interface BadgeDisplayProps {
  badges: BadgeData[];
  size?: "sm" | "md";
}

export function BadgeDisplay({ badges, size = "sm" }: BadgeDisplayProps) {
  if (badges.length === 0) return null;

  const iconSize = size === "sm" ? "text-sm" : "text-lg";
  const textSize = size === "sm" ? "text-[9px]" : "text-[11px]";

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <div
          key={badge.slug}
          className="group relative flex items-center gap-0.5 rounded-full border border-t-border bg-t-subtle px-2 py-0.5"
          title={`${badge.name}: ${badge.description}`}
        >
          <span className={iconSize}>{badge.icon}</span>
          <span className={`${textSize} font-medium text-t-text`}>{badge.name}</span>
        </div>
      ))}
    </div>
  );
}
