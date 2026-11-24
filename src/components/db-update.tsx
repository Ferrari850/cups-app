/** Shown when the new POS tables are not in the database yet. */
export function DbUpdateNeeded({ text }: { text: string }) {
  return <p className="card mt-4 border-2 border-dashed border-amber-300 bg-amber-50 text-amber-900">{text}</p>;
}
