export const REGIONS = [
  "경기",
  "강원",
  "충북",
  "충남",
  "경북",
  "경남",
  "전북",
  "전남",
  "제주",
] as const;

export type Region = (typeof REGIONS)[number];

export const CATEGORIES = [
  { value: "sr-600", label: "SR-600", emoji: "🏁" },
  { value: "dongbu-60-pass", label: "동부 60고개", emoji: "⛰️" },
  { value: "adventure", label: "어드벤처", emoji: "⚡" },
  { value: "baekdudaegan", label: "백두대간", emoji: "🏔️" },
  { value: "strawberry", label: "딸기", emoji: "🍓" },
  { value: "seagull", label: "갈매기", emoji: "🦅" },
  { value: "river-to-sea", label: "강에서바다로", emoji: "🌊" },
] as const;

export const DISTANCE_RANGES = [
  { value: "200", label: "200K", min: 150, max: 249 },
  { value: "300", label: "300K", min: 250, max: 349 },
  { value: "400", label: "400K", min: 350, max: 449 },
  { value: "600", label: "600K", min: 450, max: 749 },
  { value: "1000", label: "1000K", min: 750, max: 1500 },
] as const;

export interface CourseWithGeojson {
  id: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  estimatedTime: string | null;
  startLocation: string;
  endLocation: string;
  region: string | null;
  category: string[];
  tags: string[];
  description: string | null;
  gpxFileKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  geojson?: string | null;
}
