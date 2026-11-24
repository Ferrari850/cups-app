/** Shown right away when a page is opened, so a tap gets instant feedback while the data loads. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-8 w-48 rounded-xl bg-bean-200/70" />
      <div className="card h-24" />
      <div className="card h-20" />
      <div className="card h-20" />
    </div>
  );
}
