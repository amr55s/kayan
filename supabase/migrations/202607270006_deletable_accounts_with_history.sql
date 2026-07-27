-- Preserve delivery history while allowing admins to remove Auth/profile accounts.

alter table public.delivery_orders
  alter column created_by drop not null;

alter table public.delivery_orders
  drop constraint if exists delivery_orders_created_by_fkey,
  add constraint delivery_orders_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.delivery_orders
  drop constraint if exists delivery_orders_assigned_driver_id_fkey,
  add constraint delivery_orders_assigned_driver_id_fkey
    foreign key (assigned_driver_id) references public.profiles(id) on delete set null;

