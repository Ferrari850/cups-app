import { getSession } from "@/lib/session";
import { fmtDay, fmtTime, type Locale } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { cancelSwap, decideSwap, respondSwap } from "./actions";

type ShiftRef = { starts_at: string; ends_at: string } | null;
type Swap = {
  id: string;
  status: "pending_colleague" | "pending_manager" | "approved" | "rejected" | "declined" | "cancelled";
  message: string | null;
  requester_id: string;
  target_id: string;
  created_at: string;
  shift: ShiftRef;
  target_shift: ShiftRef;
  requester: { full_name: string } | null;
  target: { full_name: string } | null;
};

const SELECT = `id, status, message, requester_id, target_id, created_at,
  shift:shifts!swap_requests_shift_id_fkey(starts_at, ends_at),
  target_shift:shifts!swap_requests_target_shift_id_fkey(starts_at, ends_at),
  requester:profiles!swap_requests_requester_id_fkey(full_name),
  target:profiles!swap_requests_target_id_fkey(full_name)`;

export default async function SwapsPage() {
  const { supabase, profile, t, locale, isManager } = await getSession();
  const { data } = await supabase.from("swap_requests").select(SELECT).order("created_at", { ascending: false }).limit(60);
  const swaps = (data ?? []) as unknown as Swap[];

  const incoming = swaps.filter((s) => s.target_id === profile.id && s.status === "pending_colleague");
  const toApprove = isManager ? swaps.filter((s) => s.status === "pending_manager") : [];
  const mine = swaps.filter((s) => s.requester_id === profile.id || (s.target_id === profile.id && s.status !== "pending_colleague"));
  const others = isManager
    ? swaps.filter((s) => s.requester_id !== profile.id && s.target_id !== profile.id && s.status !== "pending_manager")
    : [];

  return (
    <>
      <PageHeader title={t.swaps} />
      {isManager && (
        <Section title={t.toApprove}>
          {toApprove.length ? (
            <ul className="space-y-2">
              {toApprove.map((s) => (
                <SwapCard key={s.id} s={s} t={t} locale={locale}>
                  <TwoButtons
                    action={decideSwap}
                    id={s.id}
                    field="approve"
                    yes={t.approve}
                    no={t.reject}
                  />
                </SwapCard>
              ))}
            </ul>
          ) : (
            <Empty>{t.none}</Empty>
          )}
        </Section>
      )}

      <Section title={t.incoming}>
        {incoming.length ? (
          <ul className="space-y-2">
            {incoming.map((s) => (
              <SwapCard key={s.id} s={s} t={t} locale={locale}>
                <TwoButtons action={respondSwap} id={s.id} field="accept" yes={t.accept} no={t.decline} />
              </SwapCard>
            ))}
          </ul>
        ) : (
          <Empty>{t.none}</Empty>
        )}
      </Section>

      <Section title={t.outgoing}>
        {mine.length ? (
          <ul className="space-y-2">
            {mine.map((s) => (
              <SwapCard key={s.id} s={s} t={t} locale={locale}>
                {s.requester_id === profile.id && (s.status === "pending_colleague" || s.status === "pending_manager") && (
                  <form action={cancelSwap}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton className="btn-secondary btn-sm">{t.cancel}</SubmitButton>
                  </form>
                )}
              </SwapCard>
            ))}
          </ul>
        ) : (
          <Empty>{t.none}</Empty>
        )}
      </Section>

      {others.length > 0 && (
        <Section title={t.everyone}>
          <ul className="space-y-2">
            {others.map((s) => (
              <SwapCard key={s.id} s={s} t={t} locale={locale} />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function ShiftText({ s, locale }: { s: ShiftRef; locale: Locale }) {
  if (!s) return <>—</>;
  return (
    <>
      {fmtDay(s.starts_at, locale)}{" "}
      <span className="num">
        {fmtTime(s.starts_at, locale)}–{fmtTime(s.ends_at, locale)}
      </span>
    </>
  );
}

function SwapCard({ s, t, locale, children }: { s: Swap; t: Dict; locale: Locale; children?: React.ReactNode }) {
  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <b>{s.requester?.full_name}</b> → <b>{s.target?.full_name}</b>
        </div>
        <StatusBadge status={s.status} label={t[`status_${s.status}`]} />
      </div>
      <div className="text-sm">
        <ShiftText s={s.shift} locale={locale} />
        {s.target_shift && (
          <div className="muted">
            ⇄ <ShiftText s={s.target_shift} locale={locale} />
          </div>
        )}
      </div>
      {s.message && <p className="rounded-lg bg-bean-50 p-2 text-sm">“{s.message}”</p>}
      {children}
    </li>
  );
}

function TwoButtons({
  action,
  id,
  field,
  yes,
  no,
}: {
  action: (f: FormData) => Promise<void>;
  id: string;
  field: string;
  yes: string;
  no: string;
}) {
  return (
    <div className="flex gap-2">
      {[
        ["1", yes, "btn-primary"],
        ["0", no, "btn-danger"],
      ].map(([v, label, cls]) => (
        <form key={v} action={action} className="flex-1">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name={field} value={v} />
          <SubmitButton className={`${cls} btn-sm w-full`}>{label}</SubmitButton>
        </form>
      ))}
    </div>
  );
}
