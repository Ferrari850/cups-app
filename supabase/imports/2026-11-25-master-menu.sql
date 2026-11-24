-- CUPS master menu (24 Nov 2026): POS prices, Arabic names, categories,
-- current Beanz/Talabat/Falik prices as fixed channel prices, and add-ons.
-- Safe to run more than once. All or nothing.
begin;

create temp table sheet (name text, name_ar text, category text, pos numeric, beanz numeric, talabat numeric, falik numeric, addons text) on commit drop;
insert into sheet values
('Avocado Toast Halloumi & Sun-dried Tomato',null,null,29,20,32,24,null),
('Caramel Matcha',null,null,24,24,28,26,null),
('Cold Brew',null,null,28,17,27,21,null),
('Dirty Espresso',null,null,19,19,27,23,null),
('Double Espresso',null,null,13,null,null,null,null),
('Egg Turkey Sandwich',null,null,27,27,27,32,null),
('Flipped Cheesecake',null,null,16,16,25,19,null),
('Japanese Egg Bun',null,null,19,19,19,18,null),
('Kinder San Sebastian',null,null,21,21,25,25,null),
('Kinder Waffle',null,null,20,16,20,20,null),
('Kunafa Crepe',null,null,16,16,23,20,null),
('Labneh Zaatar Toast',null,null,21,21,25,22,null),
('Mai Dubai Water',null,null,3,3,3,4,null),
('Mix Chocolate Waffle',null,null,20,16,20,20,null),
('Mix Italian Sauce Pasta',null,null,33,33,33,32,null),
('Nutella San Sebastian',null,null,21,21,29,25,null),
('Nutella Waffle',null,null,20,16,20,20,null),
('Perrier Sparkling Water',null,null,7,7,7,9,null),
('Pistachio San Sebastian',null,null,20,20,25,24,null),
('Pistachio Waffle',null,null,20,16,20,20,null),
('Salted vanilla matcha',null,null,26,null,null,null,null),
('Shakshuka',null,null,21,21,27,26,null),
('Tiramisu',null,null,25,25,25,30,null),
('Vanilla Matcha',null,null,23,23,28,26,null),
('White Sauce Pasta',null,null,33,33,33,32,null),
('Acai Bowl','طبق اساي','Acai',26,26,null,null,'Extra Acai = +10.50, Extra Peanut butter = +3.15'),
('Acai Smoothie','أساي سموثي','Acai',27,27,27,27,'Extra Acai = +10.50, Extra Peanut butter = +3.15'),
('Mini Acai Smoothie','ميني اساي سموثي','Acai',15,15,18,null,'Extra Acai = +10.50, Extra Peanut butter = +3.15'),
('Americano','امريكانو','Black Coffee',15,15,15,15,'Ethiopia Beans = 15.00, Brazil Beans = 15.00'),
('Espresso','اسبريسو','Black Coffee',11,11,11,11,'Ethiopia Beans = +0.00, Brazil Beans = +0.00'),
('Iced Americano','آيس امريكانو','Black Coffee',15,17,17,15,'Ethiopia Beans = 15.00, Brazil Beans = 15.00'),
('Turkish Coffee','تركش كوفي','Black Coffee',10,12,12,11,null),
('Avo Toast Halloumi','حلومي افوتوست','Breakfast',27,27,32,22,null),
('Chicken Sandwich','ساندويتش دجاج','Breakfast',23,23,28,24,null),
('Croissant Creamy Mushroom Egg','كرواسون بيض بكريم المشروم','Breakfast',25,25,28,25,null),
('Crunchy Halloumi Bun','شطيرة حلومي مقرمش','Breakfast',18,18,19,17,null),
('Fetta Avotoast','فيتا افوتوست','Breakfast',26,26,30,23,null),
('Halloumi croissant','كرواسون حلومي','Breakfast',24,24,25,22,null),
('Halloumi Sandwich','ساندويتش جبن حلومي','Breakfast',24,24,28,22,null),
('Omelette Cheese sourdough','شطيرة اوملت ساوردو بالجبن','Breakfast',23,21,26,22,null),
('Plain Croissant','كرواسون','Breakfast',9,9,11,9,null),
('Scrambled Bun','فطيرة بيض سكرامبل','Breakfast',17,17,null,18,null),
('Scrambled eggs feta sourdough','ساوردو بيض بالفيتا','Breakfast',34,34,42,29,null),
('Triple Cheese Croissant','كرواسون الاجبان الثلاثة','Breakfast',19,19,25,20,null),
('Turkey Croissant','تركي كرواسون','Breakfast',19,19,23,20,null),
('Turkey sourdough Sandwich','شطيرة تركي ساوردو','Breakfast',25,25,26,24,null),
('Ice latte','آيس لاتيه','Cold Coffee',18,18,24,18,'Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00'),
('Ice Spanish','آيس سبانش','Cold Coffee',18,18,24,18,'Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00'),
('Ice vanilla latte','آيس فانيلا لاتيه','Cold Coffee',18,18,24,18,'Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00'),
('Hibiscus','كركديه','Cold Drinks',18,18,20,17,null),
('Lemon Mint juice','عصير ليمون نعناع','Cold Drinks',15,null,17,15,null),
('Orange Juice','عصير برتقال','Cold Drinks',18,null,17,17,null),
('Peach Juice','عصير خوخ','Cold Drinks',18,null,17,18,null),
('Tropical Blue','تروبيكال بلو','Cold Drinks',33,null,null,null,null),
('Kinder Crepe','كندر كريب','Crepe',20,null,23,20,null),
('Mix Chocolate Crepe','مكس جوكلت كريب','Crepe',20,null,23,20,null),
('Nutella Crepe','نوتيلا كريب','Crepe',20,null,23,20,null),
('Pistachio Crepe','كريب بستاشيو','Crepe',20,null,23,20,null),
('Ethiopian','اثيوبية','Filtered Coffee',25,25,27,25,null),
('Tobacco Vanilla','توباكو فاينلا','Filtered Coffee',28,29,44,33,null),
('V60 Banana','V60 موز','Filtered Coffee',28,28,38,33,null),
('V60 Coconut','V60  كوكونت','Filtered Coffee',27,27,37,33,null),
('V60 Golden Hive','V60 قولدن هايف','Filtered Coffee',25,25,27,25,null),
('V60 Lychee','V60 ليتشي','Filtered Coffee',26,26,37,33,null),
('V60 Pina Colada','V60 بينا كولادا','Filtered Coffee',28,28,38,33,null),
('V60 Tobacco','V60 توباكو','Filtered Coffee',37,37,55,44,null),
('V60 Velvet Bloom','V60 فيلفت بلوم','Filtered Coffee',28,28,38,33,null),
('V60 Wild Berries','V60 توت بري','Filtered Coffee',28,28,38,33,null),
('Pistachio','بيستاشيو','Gelato',20,12,null,12,null),
('Coconut Matcha',null,'Matcha',24,24,28,21,null),
('Iced Matcha','آيس ماتشا','Matcha',21,21,27,26,'Normal milk = +0.00, Oat Milk = +3.00, Coconut milk = +3.00, Coconut Water = +3.00'),
('Mango Matcha','مانجو ماتشا','Matcha',22,23,28,26,'Normal milk = +0.00, Oat Milk = +3.00, Coconut milk = +3.00, Coconut Water = +3.00'),
('Peach Matcha',null,'Matcha',22,22,31,21,null),
('Strawberry Matcha','ماتشا الفراولة','Matcha',21,23,28,26,'Normal milk = +0.00, Oat Milk = +3.00, Coconut milk = +3.00, Coconut Water = +3.00'),
('Nutella','نوتيلا','Milk shake',20,null,null,null,null),
('Strawberry Milk','حليب فراولة','Milk shake',15,15,17,23,null),
('Kinder','كندر','Pancakes',20,12,null,12,null),
('Mix Chocolate','مكس جوكلت','Pancakes',20,null,null,null,null),
('Aseeda','عصيدة','Sweets',24,24,null,null,null),
('Banana Pudding','بنانا بودنق','Sweets',25,25,25,23,null),
('Basboosa','بسبوسة','Sweets',24,24,null,null,null),
('Brownies','براونيز','Sweets',24,24,null,null,null),
('Cocoberry','كوكوبيري','Sweets',25,25,25,23,null),
('Dates Cake','تمر كيك','Sweets',24,24,null,null,null),
('Dolce Cake','دولجي كيك','Sweets',28,28,null,null,null),
('Latte Cake','لاتيه كيك','Sweets',20,20,23,20,null),
('Mini Cookies','ميني كوكيز','Sweets',30,null,35.5,32.5,null),
('Molten Cake','مولتن كيك','Sweets',24,24,null,null,null),
('San Sebastian','سان سبيستيان','Sweets',21,20,25,20,null),
('Cappuccino','كباتشينو','White',18,18,18,19,'Fresh Milk = +0.00, Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00, Ethiopia Beans = +0.00, Brazil Beans = +0.00'),
('Cortado','كورتادو','White',14,14,16,15,'Fresh Milk = +0.00, Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00, Ethiopia Beans = +0.00, Brazil Beans = +0.00'),
('Flat White','فلات وايت','White',17,17,16,18,'Ethiopia Beans = 17.00, Fresh Milk = 17.00, Normal Milk = 17.00, Brazil Beans = 17.00, Oat Milk = 20.00, Coconut Milk = 20.00'),
('Latte','لاتيه','White',17,17,18,18,'Ethiopia Beans = 17.00, Fresh Milk = 17.00, Brazil Beans = 17.00, Normal Milk = 17.00, Oat Milk = 20.00, Coconut Milk = 20.00'),
('Piccolo','بيكولو','White',13,13,19,14,'Fresh Milk = 13.00, Ethiopia Beans = 13.00, Normal Milk = 13.00, Brazil Beans = 13.00, Oat Milk = 16.00, Coconut Milk = 16.00'),
('Spanish cortado','سبانش كورتادو','White',17,17,17,18,'Fresh Milk = 17.00, Ethiopia Beans = 17.00, Brazil Beans = 17.00, Normal Milk = 17.00, Oat Milk = 20.00, Coconut Milk = 20.00'),
('Spanish Latte','سبانش لاتيه','White',19,19,19,20,'Fresh Milk = +0.00, Normal Milk = +0.00, Oat Milk = +3.00, Coconut Milk = +3.00, Ethiopia Beans = +0.00, Brazil Beans = +0.00');

-- Items on the sheet that the app doesn't have yet.
insert into public.menu_items (name, name_ar, category, selling_price)
select s.name, s.name_ar, s.category, s.pos from sheet s
where not exists (select 1 from public.menu_items m where lower(trim(m.name)) = lower(trim(s.name)));

-- POS price from the sheet; Arabic name and category only where the app has none.
update public.menu_items m
   set selling_price = s.pos,
       name_ar = coalesce(nullif(trim(m.name_ar), ''), s.name_ar),
       category = coalesce(nullif(trim(m.category), ''), s.category)
  from sheet s
 where lower(trim(m.name)) = lower(trim(s.name)) and s.pos is not null;

-- What each app charges today, as a fixed price for that channel.
insert into public.channel_prices (menu_item_id, channel_id, price)
select m.id, c.id, p.price
from sheet s
join public.menu_items m on lower(trim(m.name)) = lower(trim(s.name))
cross join lateral (values ('beanz', s.beanz), ('talabat', s.talabat), ('falik', s.falik)) p(code, price)
join public.channels c on c.code = p.code
where p.price is not null
on conflict (menu_item_id, channel_id) do update set price = excluded.price;

-- Add-on groups and options (no stock link yet).
insert into public.modifier_groups (name, name_ar, min_select, max_select, sort)
select v.* from (values
  ('Milk', 'الحليب', 0, 1, 1),
  ('Matcha milk', 'حليب الماتشا', 0, 1, 2),
  ('Beans', 'البن', 0, 1, 3),
  ('Acai extras', 'إضافات الأساي', 0, 2, 4)
) v(name, name_ar, min_select, max_select, sort)
where not exists (select 1 from public.modifier_groups g where g.name = v.name);

insert into public.modifier_options (group_id, name, name_ar, price_delta, sort)
select g.id, v.opt, v.opt_ar, v.price, v.sort from (values
  ('Milk', 'Normal milk', 'حليب عادي', 0, 1),
  ('Milk', 'Fresh milk', 'حليب طازج', 0, 2),
  ('Milk', 'Oat milk', 'حليب الشوفان', 3, 3),
  ('Milk', 'Coconut milk', 'حليب جوز الهند', 3, 4),
  ('Matcha milk', 'Normal milk', 'حليب عادي', 0, 1),
  ('Matcha milk', 'Oat milk', 'حليب الشوفان', 3, 2),
  ('Matcha milk', 'Coconut milk', 'حليب جوز الهند', 3, 3),
  ('Matcha milk', 'Coconut water', 'ماء جوز الهند', 3, 4),
  ('Beans', 'Ethiopia beans', 'بن إثيوبي', 0, 1),
  ('Beans', 'Brazil beans', 'بن برازيلي', 0, 2),
  ('Acai extras', 'Extra Acai', 'أساي إضافي', 10.5, 1),
  ('Acai extras', 'Extra peanut butter', 'زبدة فول سوداني إضافية', 3.15, 2)
) v(grp, opt, opt_ar, price, sort)
join public.modifier_groups g on g.name = v.grp
where not exists (select 1 from public.modifier_options o where o.group_id = g.id and o.name = v.opt);

-- Attach groups to items as listed on the sheet.
insert into public.menu_item_modifier_groups (menu_item_id, group_id)
select distinct m.id, g.id
from sheet s
join public.menu_items m on lower(trim(m.name)) = lower(trim(s.name))
join public.modifier_groups g on
     (g.name = 'Milk' and s.addons ilike '%milk%' and s.category not in ('Matcha'))
  or (g.name = 'Matcha milk' and s.addons ilike '%milk%' and s.category = 'Matcha')
  or (g.name = 'Beans' and s.addons ilike '%beans%')
  or (g.name = 'Acai extras' and s.addons ilike '%extra acai%')
on conflict do nothing;

select
  (select count(*) from sheet) as sheet_items,
  (select count(*) from public.menu_items m join sheet s on lower(trim(m.name)) = lower(trim(s.name))) as matched_in_app,
  (select count(*) from public.menu_items where selling_price is null and active) as still_no_price,
  (select count(*) from public.channel_prices) as app_prices,
  (select count(*) from public.menu_item_modifier_groups) as addon_links;

commit;
