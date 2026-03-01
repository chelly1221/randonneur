import { GalleryGrid } from "@/components/community/photo-gallery";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "사진 갤러리 - Audax Korea",
  description: "라이더들이 공유한 코스 사진을 감상하세요.",
};

export default function GalleryPage() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">사진 갤러리</h2>
      <GalleryGrid />
    </div>
  );
}
