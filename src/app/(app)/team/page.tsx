import { requireManager } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import AddStaff from "./add-staff";
import MemberCard from "./member-card";

export default async function TeamPage() {
  const { supabase, t, isOwner, profile } = await requireManager();
  const { data: people } = await supabase.from("profiles").select("*").order("active", { ascending: false }).order("full_name");
  return (
    <>
      <PageHeader title={t.team} back="/more" />
      <AddStaff t={t} isOwner={isOwner} />
      <ul className="mt-4 space-y-2">
        {people?.map((p) => (
          <MemberCard key={p.id} p={p} t={t} isOwner={isOwner} isMe={p.id === profile.id} />
        ))}
      </ul>
    </>
  );
}
