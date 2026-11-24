import { getSession } from "@/lib/session";
import { missingTable, type Channel, type ModGroup, type PosItem, type Settings } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import Till from "./till";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const { supabase, t, locale, isManager } = await getSession();
  const [ch, menu, fixed, groups, options, links, settings, reg] = await Promise.all([
    supabase.from("channels").select("*").eq("active", true).order("sort"),
    supabase
      .from("menu_items")
      .select("*")
      .eq("active", true)
      .order("category")
      .order("sort")
      .order("name"),
    supabase.from("channel_prices").select("menu_item_id, channel_id, price"),
    supabase.from("modifier_groups").select("id, name, name_ar, min_select, max_select, sort").order("sort").order("name"),
    supabase.from("modifier_options").select("id, group_id, name, name_ar, price_delta, sort").eq("active", true).order("sort").order("name"),
    supabase.from("menu_item_modifier_groups").select("menu_item_id, group_id"),
    supabase.from("cafe_settings").select("*").maybeSingle(),
    supabase.from("registers").select("id").is("closed_at", null).maybeSingle(),
  ]);
  if (missingTable(ch.error) || missingTable(menu.error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;

  const fixedBy = new Map<string, Record<string, number>>();
  for (const f of fixed.data ?? []) {
    fixedBy.set(f.menu_item_id, { ...(fixedBy.get(f.menu_item_id) ?? {}), [f.channel_id]: Number(f.price) });
  }
  const groupsBy = new Map<string, string[]>();
  for (const l of links.data ?? []) groupsBy.set(l.menu_item_id, [...(groupsBy.get(l.menu_item_id) ?? []), l.group_id]);

  const items: PosItem[] = (menu.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    name_ar: m.name_ar,
    category: m.category,
    selling_price: m.selling_price == null ? null : Number(m.selling_price),
    sold_out: m.sold_out,
    image_url: m.image_url ?? null,
    groups: groupsBy.get(m.id) ?? [],
    fixed: fixedBy.get(m.id) ?? {},
  }));
  const modGroups: ModGroup[] = (groups.data ?? []).map((g) => ({
    ...g,
    options: (options.data ?? [])
      .filter((o) => o.group_id === g.id)
      .map((o) => ({ id: o.id, name: o.name, name_ar: o.name_ar, price_delta: Number(o.price_delta) })),
  }));

  return (
    <Till
      t={t}
      locale={locale}
      isManager={isManager}
      channels={(ch.data ?? []) as Channel[]}
      items={items}
      groups={modGroups}
      settings={(settings.data ?? null) as Settings | null}
      drawerOpen={!!reg.data}
    />
  );
}
