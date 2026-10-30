// Lấy sản phẩm + cài đặt từ Supabase trước khi build (Netlify chạy tự động).
// Chưa nối Supabase → bỏ qua, build dùng data/products.json.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const SITE = JSON.parse(fs.readFileSync(path.join(root, "site.json"), "utf8"));
const url = (process.env.SUPABASE_URL || SITE.supabase?.url || "").replace(/\/$/, "");
const key = process.env.SUPABASE_ANON_KEY || SITE.supabase?.anonKey || "";
const cache = path.join(root, ".cache");
fs.rmSync(cache, { recursive: true, force: true });

if (!url || !key) {
  console.log("• Chưa cấu hình Supabase → dùng data/products.json");
  process.exit(0);
}

const get = async p => {
  const r = await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) } });
  if (r.status === 404) {
    // Chưa chạy supabase/schema.sql: vẫn build bằng dữ liệu mẫu để web không bị sập
    console.log("• Supabase chưa có bảng (chưa chạy schema.sql) → dùng data/products.json");
    process.exit(0);
  }
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
};

(async () => {
  const [rows, settings] = await Promise.all([
    get("products?visible=eq.true&select=*&order=id"),
    get("shop_settings?id=eq.1&select=*"),
  ]);
  if (!rows.length) {
    console.log("• Supabase chưa có sản phẩm → dùng data/products.json (hãy chạy supabase/seed.sql)");
    process.exit(0);
  }
  const products = rows.map(r => ({
    id: r.id, cat: r.cat, sub: r.sub, brand: r.brand, origin: r.origin, name: r.name, vol: r.vol,
    price: r.price, ...(r.sale ? { sale: r.sale } : {}), isNew: r.is_new, inStock: r.in_stock, pop: r.pop,
    actives: r.actives || [], skin: r.skin || [], concerns: r.concerns || [], images: r.images || [],
    desc: r.descr, howto: r.howto, ingredients: r.ingredients, shape: r.shape, tint: r.tint,
  }));
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, "products.json"), JSON.stringify(products));
  const s = settings[0];
  if (s) fs.writeFileSync(path.join(cache, "settings.json"), JSON.stringify({
    shipFee: s.ship_fee, codFee: s.cod_fee, codDepositFrom: s.cod_deposit_from, codDepositRate: Number(s.cod_deposit_rate), codMax: s.cod_max,
  }));
  console.log(`✓ Lấy ${products.length} sản phẩm từ Supabase`);
})().catch(e => {
  console.error("✗ Không lấy được dữ liệu từ Supabase:", e.message);
  process.exit(1); // dừng build để không đưa web sai lên
});
