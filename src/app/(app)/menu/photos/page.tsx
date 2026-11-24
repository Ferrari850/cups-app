import { requireManager } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import BulkPhotos from "./bulk";

/** Upload a whole folder of menu photos at once; each file is matched to the item with the same name. */
export default async function MenuPhotosPage() {
  const { supabase, t } = await requireManager();
  const { data } = await supabase.from("menu_items").select("*").order("category").order("name");
  const items = (data ?? []).map((m) => ({ id: m.id as string, name: m.name as string, name_ar: m.name_ar as string | null, image_url: (m.image_url ?? null) as string | null }));
  return (
    <>
      <PageHeader title={t.menuPhotos} back="/menu" />
      <BulkPhotos
        items={items}
        labels={{
          hint: t.menuPhotosHint,
          pick: t.pickPhotos,
          matched: t.photosMatched,
          unmatched: t.photosUnmatched,
          upload: t.uploadPhotos,
          uploading: t.uploading,
          done: t.photosDone,
          missing: t.itemsWithoutPhoto,
          replace: t.replaceExisting,
        }}
      />
    </>
  );
}
