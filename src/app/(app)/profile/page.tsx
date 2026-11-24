import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import ProfileForms from "./profile-forms";

export default async function ProfilePage() {
  const { profile, t, isManager } = await getSession();
  return (
    <>
      <PageHeader title={t.profile} back="/more" />
      <ProfileForms t={t} name={profile.full_name} phone={profile.phone ?? ""} isManager={isManager} />
    </>
  );
}
