"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchKey, uploadMenuPhoto } from "@/lib/menu-photo";

type Item = { id: string; name: string; name_ar: string | null; image_url: string | null };
type Labels = { hint: string; pick: string; matched: string; unmatched: string; upload: string; uploading: string; done: string; missing: string; replace: string };

export default function BulkPhotos({ items, labels }: { items: Item[]; labels: Labels }) {
  const [files, setFiles] = useState<File[]>([]);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const router = useRouter();

  const byKey = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) {
      m.set(matchKey(i.name), i);
      if (i.name_ar) m.set(matchKey(i.name_ar), i);
    }
    return m;
  }, [items]);

  const pairs = files.map((f) => ({ file: f, item: byKey.get(matchKey(f.name)) ?? null }));
  const matched = pairs.filter((p) => p.item && (replace || !p.item.image_url));
  const unmatched = pairs.filter((p) => !p.item);
  const missing = items.filter((i) => !i.image_url);

  async function run() {
    setProgress({ done: 0, total: matched.length, errors: [] });
    const errors: string[] = [];
    let done = 0;
    for (const p of matched) {
      try {
        await uploadMenuPhoto(p.item!.id, p.file);
      } catch (e) {
        errors.push(`${p.file.name}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      setProgress({ done, total: matched.length, errors: [...errors] });
    }
    setFiles([]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="muted">{labels.hint}</p>
      <div className="card space-y-3">
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} className="block w-full text-sm" aria-label={labels.pick} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> {labels.replace}
        </label>
        {files.length > 0 && (
          <>
            <p className="text-sm">
              <b className="num">{matched.length}</b> {labels.matched}
              {unmatched.length > 0 && (
                <>
                  {" · "}
                  <b className="num text-amber-700">{unmatched.length}</b> {labels.unmatched}: {unmatched.map((u) => u.file.name).join(", ")}
                </>
              )}
            </p>
            <button type="button" className="btn-primary w-full" disabled={!matched.length || (progress != null && progress.done < progress.total)} onClick={run}>
              {labels.upload} ({matched.length})
            </button>
          </>
        )}
        {progress && (
          <p className="text-sm">
            {progress.done < progress.total ? `${labels.uploading} ${progress.done}/${progress.total}` : `✓ ${labels.done} ${progress.done - progress.errors.length}/${progress.total}`}
            {progress.errors.map((e) => (
              <span key={e} className="block text-red-700">{e}</span>
            ))}
          </p>
        )}
      </div>
      <section className="card">
        <h2 className="eyebrow mb-2">
          {labels.missing} (<span className="num">{missing.length}</span>)
        </h2>
        <p className="text-sm text-bean-700">{missing.map((i) => i.name).join(" · ") || "✓"}</p>
      </section>
    </div>
  );
}
