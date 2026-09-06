begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

insert into public.merchants(id,display_name) values('e1000000-0000-4000-8000-000000000001','Branch assignment fixture');
insert into public.stores(id,merchant_id,slug,name,delivery_mode)
 values('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','branch-assignment-fixture','Branch assignment fixture','flexible');
insert into public.delivery_zones(id,code,name_ar,city) values
 ('e3000000-0000-4000-8000-000000000001','branch-test-one','Zone one','Cairo'),
 ('e3000000-0000-4000-8000-000000000002','branch-test-two','Zone two','Cairo'),
 ('e3000000-0000-4000-8000-000000000003','branch-test-legacy','Legacy zone','Cairo'),
 ('e3000000-0000-4000-8000-000000000004','branch-test-none','No coverage','Cairo');
insert into public.branch_delivery_zones(branch_id,zone_id,delivery_mode,fee,free_delivery_threshold,minimum_order,estimated_minutes_min,estimated_minutes_max)
 select branch.id,config.zone_id,config.mode::public.marketplace_delivery_mode,config.fee,5000,1000,30,60
 from public.store_branches branch cross join (values
 ('e3000000-0000-4000-8000-000000000001'::uuid,'platform',250),
 ('e3000000-0000-4000-8000-000000000001'::uuid,'self',400),
 ('e3000000-0000-4000-8000-000000000002'::uuid,'platform',900)
 ) config(zone_id,mode,fee) where branch.store_id='e2000000-0000-4000-8000-000000000001';
insert into public.store_delivery_zones(store_id,zone_id,delivery_mode,fee,minimum_order,estimated_minutes_min,estimated_minutes_max)
 values('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003','platform',700,1000,40,70);

-- Exercise the actual production trigger with only the NEW columns it consumes.
-- Unrelated commerce setup cannot hide its branch selection/math regression.
create temporary table branch_assignment_probe (
  label text,store_id uuid,delivery_zone_id uuid,delivery_mode public.marketplace_delivery_mode,
  subtotal bigint,merchant_discount_total bigint default 100,platform_discount_total bigint default 200,
  branch_id uuid,delivery_fee bigint,grand_total bigint,branch_snapshot jsonb
) on commit drop;
create trigger branch_assignment_probe_trigger before insert on branch_assignment_probe
 for each row execute function public.assign_marketplace_order_branch();
insert into branch_assignment_probe(label,store_id,delivery_zone_id,delivery_mode,subtotal,branch_id)
 values('platform','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','platform',2000,'e9000000-0000-4000-8000-000000000001'),
 ('self','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','self',2000,null),
 ('zone-two','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','platform',2000,null),
 ('free','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','platform',6000,null),
 ('legacy','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003','platform',2000,null);
select extensions.is((select delivery_fee from branch_assignment_probe where label='platform'),250::bigint,'composite branch key selects platform fee');
select extensions.is((select delivery_fee from branch_assignment_probe where label='self'),400::bigint,'same branch and zone distinguish delivery mode');
select extensions.is((select delivery_fee from branch_assignment_probe where label='zone-two'),900::bigint,'same branch and mode distinguish delivery zone');
select extensions.is((select grand_total from branch_assignment_probe where label='platform'),1950::bigint,'totals preserve both discounts and configured fee');
select extensions.is((select delivery_fee from branch_assignment_probe where label='free'),0::bigint,'free delivery threshold remains effective');
select extensions.is((select delivery_fee from branch_assignment_probe where label='legacy'),700::bigint,'legacy store-zone compatibility still works');
select extensions.ok((select branch_id::text=branch_snapshot->>'id' and branch_id<>'e9000000-0000-4000-8000-000000000001' from branch_assignment_probe where label='platform'),'server chooses branch and snapshot instead of trusting supplied branch ID');
select extensions.throws_ok($$insert into branch_assignment_probe(store_id,delivery_zone_id,delivery_mode,subtotal) values('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','platform',999)$$,
 '22023',null,'minimum order is enforced');
select extensions.throws_ok($$insert into branch_assignment_probe(store_id,delivery_zone_id,delivery_mode,subtotal) values('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000004','platform',2000)$$,
 '22023',null,'uncovered zone fails closed');
select * from extensions.finish(true);
rollback;
