/** Shown right away when a page is opened, so a tap gets instant feedback while the data loads. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-7 w-40 rounded-lg bg-bean-100" />
      <div className="card h-20 bg-bean-50" />
      <div className="card h-20 bg-bean-50" />
      <div className="card h-20 bg-bean-50" />
    </div>
  );
}
