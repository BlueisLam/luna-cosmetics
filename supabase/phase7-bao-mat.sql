-- Chạy 1 lần trong Supabase → SQL Editor (đã gộp trong schema.sql)
-- GIAI ĐOẠN 7: khách không đọc thẳng bảng products nữa
-- Web khách chỉ đọc view "catalog": sản phẩm đang hiện, đúng các cột web cần.
-- Không lộ: sản phẩm đang ẩn, cờ hàng order (chỉ còn "thời gian giao"), ngày tạo / sửa.
-- =====================================================================
create or replace view public.catalog with (security_barrier = true) as
select p.id, p.variant_of, p.position, p.cat, p.sub, p.brand, p.origin, p.name, p.vol,
       p.price, p.sale, p.is_new, p.pop, p.actives, p.skin, p.concerns, p.images,
       p.descr, p.howto, p.ingredients, p.shape, p.tint,
       (p.in_stock or p.preorder) as available,
       case when p.preorder then coalesce(nullif(p.lead_time, ''), '7–14 ngày') else '' end as ship_time
from public.products p
where p.visible;
revoke all on public.catalog from public;
grant select on public.catalog to anon, authenticated;
-- bảng products: chỉ admin đọc / sửa (policy "admin quản lý sản phẩm" ở trên)
drop policy if exists "khách xem sản phẩm đang hiện" on public.products;
revoke select on public.products from anon;


-- Khách tra cứu đơn: không trả về cờ hàng order
create or replace function public.track_order(p_code text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
  v_phone text := regexp_replace(regexp_replace(coalesce(p_phone,''), '[\s.\-]', '', 'g'), '^\+84', '0');
begin
  select * into o from public.orders where code = upper(trim(coalesce(p_code,''))) and phone = v_phone;
  if not found then return null; end if;
  return jsonb_build_object(
    'code', o.code, 'created_at', o.created_at,
    'status', case when o.status = 'bom_hang' then 'da_huy' else o.status end,
    'method', o.method, 'paid', o.paid, 'items', (select coalesce(jsonb_agg(e - 'cost' - 'preorder' - 'lead'), '[]'::jsonb) from jsonb_array_elements(o.items) e),
    'subtotal', o.subtotal, 'ship', o.ship, 'fee', o.fee, 'total', o.total, 'deposit', o.deposit,
    'buyer_name', o.buyer_name, 'address', o.address, 'city', o.city,
    'carrier', o.carrier, 'tracking_code', o.tracking_code,
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', case when e.status = 'bom_hang' then 'da_huy' else e.status end, 'at', e.created_at) order by e.created_at, e.id)
                        from public.order_events e where e.order_id = o.id), '[]'::jsonb)
  );
end $$;
revoke all on function public.track_order(text,text) from public;
grant execute on function public.track_order(text,text) to anon, authenticated;
