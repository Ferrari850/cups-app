"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { createInvoice, registerFiles } from "../actions";

type Page = { file: Blob; mime: string; preview: string | null; name: string };

/** Shrink phone photos so uploads are fast and the reader gets a clear, reasonable-size image. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2200;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file; // e.g. HEIC on some browsers: upload as is
  }
}

export default function Uploader({ t }: { t: Dict }) {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState<"" | "upload" | "read">("");
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list) return;
    const added: Page[] = [];
    for (const f of Array.from(list)) {
      if (f.type === "application/pdf") {
        added.push({ file: f, mime: "application/pdf", preview: null, name: f.name });
      } else {
        const blob = await compress(f);
        const mime = blob.type || f.type || "image/jpeg";
        added.push({ file: blob, mime, preview: URL.createObjectURL(blob), name: f.name });
      }
    }
    setPages((p) => [...p, ...added]);
  }

  function move(i: number, d: -1 | 1) {
    setPages((p) => {
      const n = [...p];
      const j = i + d;
      if (j < 0 || j >= n.length) return p;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  async function submit() {
    setError("");
    setBusy("upload");
    let id = "";
    try {
      id = await createInvoice();
      const supabase = createClient();
      const uploaded: { path: string; mime: string }[] = [];
      for (const [i, p] of pages.entries()) {
        const ext = p.mime === "application/pdf" ? "pdf" : p.mime.split("/")[1] || "jpg";
        const path = `${id}/${i + 1}.${ext}`;
        const { error } = await supabase.storage.from("invoices").upload(path, p.file, { contentType: p.mime, upsert: true });
        if (error) throw new Error(error.message);
        uploaded.push({ path, mime: p.mime });
      }
      await registerFiles(id, uploaded);
      setBusy("read");
      await fetch(`/api/invoices/${id}/read`, { method: "POST" });
      router.push(`/invoices/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
      setBusy("");
      if (id) router.push(`/invoices/${id}`);
    }
  }

  if (busy)
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bean-200 border-t-bean-700" />
        <p className="font-medium">{busy === "upload" ? t.uploading : t.reading}</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={filesRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary py-6 text-base" onClick={() => cameraRef.current?.click()}>
          <Icon name="camera" className="h-6 w-6" /> {pages.length ? t.addPage : t.takePhoto}
        </button>
        <button className="btn-secondary py-6 text-base" onClick={() => filesRef.current?.click()}>
          <Icon name="receipt" className="h-6 w-6" /> {t.choosePhotos}
        </button>
      </div>

      {pages.length > 0 && (
        <>
          <p className="muted">
            {pages.length} {t.pagesReady}
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {pages.map((p, i) => (
              <li key={i} className="relative overflow-hidden rounded-xl bg-white ring-1 ring-bean-100">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center p-2 text-center text-xs">📄 {p.name}</div>
                )}
                <span className="absolute start-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white">{i + 1}</span>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 text-white">
                  <button className="px-2 py-1" onClick={() => move(i, -1)} aria-label="earlier">‹</button>
                  <button className="px-2 py-1" onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} aria-label={t.delete}>✕</button>
                  <button className="px-2 py-1" onClick={() => move(i, 1)} aria-label="later">›</button>
                </div>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full py-4 text-base" onClick={submit}>
            {t.readInvoice} →
          </button>
        </>
      )}
    </div>
  );
}
