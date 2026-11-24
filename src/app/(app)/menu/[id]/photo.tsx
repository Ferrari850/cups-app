"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removeMenuPhoto, uploadMenuPhoto } from "@/lib/menu-photo";

export default function MenuPhoto({ id, url, labels }: { id: string; url: string | null; labels: { add: string; change: string; remove: string; uploading: string } }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="card mb-5 flex items-center gap-3 p-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-bean-100 text-2xl">📷</div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setError(null);
            try {
              await uploadMenuPhoto(id, f);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? labels.uploading : url ? labels.change : labels.add}
        </button>
        {url && !busy && (
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={async () => {
              await removeMenuPhoto(id);
              router.refresh();
            }}
          >
            {labels.remove}
          </button>
        )}
        {error && <p className="w-full text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
