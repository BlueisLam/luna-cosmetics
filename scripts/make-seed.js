// Tạo supabase/seed.sql từ data/products.json (nạp sản phẩm mẫu vào Supabase lần đầu).
// Chạy: node scripts/make-seed.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(root, "data/products.json"), "utf8"));
const q = s => "'" + String(s ?? "").replace(/'/g, "''") + "'";
const arr = a => (a && a.length ? `array[${a.map(q).join(",")}]::text[]` : "'{}'::text[]");
const rows = P.map(p => `(${p.id}, ${q(p.cat)}, ${q(p.sub)}, ${q(p.brand)}, ${q(p.origin)}, ${q(p.name)}, ${q(p.vol)}, ${p.price}, ${p.sale || "null"}, ${!!p.isNew}, ${p.inStock !== false}, ${p.pop || 5}, ${arr(p.actives)}, ${arr(p.skin)}, ${arr(p.concerns)}, ${arr(p.images)}, ${q(p.desc)}, ${q(p.howto)}, ${q(p.ingredients)}, ${q(p.shape)}, ${q(p.tint)})`);
const sql = `-- Sản phẩm mẫu. Chạy SAU schema.sql, một lần. Có thể sửa/xoá sau trên trang admin.
insert into public.products (id, cat, sub, brand, origin, name, vol, price, sale, is_new, in_stock, pop, actives, skin, concerns, images, descr, howto, ingredients, shape, tint) values
${rows.join(",\n")}
on conflict (id) do nothing;
-- Cho mã sản phẩm mới tiếp tục từ số lớn nhất
select setval(pg_get_serial_sequence('public.products','id'), (select max(id) from public.products));
`;
fs.writeFileSync(path.join(root, "supabase/seed.sql"), sql);
console.log(`✓ supabase/seed.sql: ${P.length} sản phẩm`);
