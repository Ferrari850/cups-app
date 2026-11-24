"use client";

import { createClient } from "./supabase/client";

/** Shrink a photo to at most 900 px on the long side, as WebP, so the till loads fast. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.82));
  return blob ?? file;
}

/** Upload a photo for one menu item and save its address on the item. Managers only (checked by the database). */
export async function uploadMenuPhoto(itemId: string, file: File) {
  const supabase = createClient();
  const blob = await shrink(file);
  const path = `${itemId}/${Date.now()}.webp`;
  const up = await supabase.storage.from("menu").upload(path, blob, { contentType: "image/webp" });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from("menu").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("menu_items").update({ image_url: url }).eq("id", itemId);
  if (error) throw new Error(error.message);
  return url;
}

export async function removeMenuPhoto(itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("menu_items").update({ image_url: null }).eq("id", itemId);
  if (error) throw new Error(error.message);
}

/** "Avocado Toast Halloumi & Sun-dried Tomato.jpg" -> "avocado toast halloumi sun dried tomato" */
export function matchKey(s: string) {
  return s
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}
