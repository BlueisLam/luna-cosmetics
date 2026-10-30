// Luna Cosmetics — trình tạo web tĩnh. Chạy: node build.js  →  thư mục dist/
// Không cần cài thư viện. Netlify tự chạy lệnh này mỗi lần bạn đẩy code lên GitHub.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const CACHE = path.join(ROOT, ".cache");
const fromDB = fs.existsSync(path.join(CACHE, "products.json"));
const P = JSON.parse(fs.readFileSync(fromDB ? path.join(CACHE, "products.json") : path.join(ROOT, "data/products.json"), "utf8"));
if (fs.existsSync(path.join(CACHE, "settings.json"))) Object.assign(SITE.order, JSON.parse(fs.readFileSync(path.join(CACHE, "settings.json"), "utf8")));
const SB = { url: (process.env.SUPABASE_URL || SITE.supabase?.url || "").replace(/\/$/, ""), anonKey: process.env.SUPABASE_ANON_KEY || SITE.supabase?.anonKey || "" };
const T = JSON.parse(fs.readFileSync(path.join(ROOT, "data/taxonomy.json"), "utf8"));
const BASE = SITE.url.replace(/\/$/, "");
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/&/g, " va ").replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const vnd = n => n.toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
const priceOf = p => p.sale || p.price;
const pct = p => (p.sale ? Math.round((1 - p.sale / p.price) * 100) : 0);
const uniq = a => [...new Set(a)];
const CAT_NAME = { skincare: "Skincare", makeup: "Makeup" };

P.forEach(p => {
  p.slug = slug(`${p.name} ${p.brand}`);
  p.url = `/san-pham/${p.slug}/`;
  p.images = p.images || [];
  p.inStock = p.inStock !== false;
});
const subUrl = (cat, sub) => `/${cat}/${slug(sub)}/`;
const needUrl = k => `/nhu-cau/${slug(k)}/`;
const brandUrl = b => `/thuong-hieu/${slug(b)}/`;
const activeUrl = a => `/hoat-chat/${slug(a)}/`;
const BRANDS = uniq(P.map(p => p.brand)).sort((a, b) => a.localeCompare(b, "vi"));
const ACTIVES = uniq(P.flatMap(p => p.actives)).sort((a, b) => a.localeCompare(b, "vi"));

/* ---------- ảnh minh hoạ tạm (thay bằng ảnh thật qua trường "images") ---------- */
const ACCENT = { pump: "#c79b8e", tube: "#d4a698", bottle: "#a9bcc8", dropper: "#c4a37f", jar: "#d8b3a6", compact: "#caa18d", lipstick: "#b9776b", tint: "#d99a8c" };
function art(s) {
  const a = ACCENT[s] || "#c9a395", w = "#fffaf6";
  const m = {
    pump: `<rect x="34" y="40" width="32" height="70" rx="8" fill="${w}"/><rect x="44" y="22" width="12" height="18" fill="${a}"/><rect x="40" y="16" width="26" height="7" rx="3" fill="${a}"/><rect x="40" y="62" width="20" height="22" rx="3" fill="${a}" opacity=".35"/>`,
    tube: `<path d="M32 22h36l-4 78H36z" fill="${w}"/><rect x="38" y="100" width="24" height="12" rx="3" fill="${a}"/><rect x="38" y="44" width="24" height="20" rx="3" fill="${a}" opacity=".35"/>`,
    bottle: `<rect x="30" y="38" width="40" height="72" rx="10" fill="${w}"/><rect x="40" y="20" width="20" height="20" rx="4" fill="${a}"/><rect x="38" y="66" width="24" height="22" rx="3" fill="${a}" opacity=".35"/>`,
    dropper: `<rect x="32" y="52" width="36" height="58" rx="9" fill="${a}" opacity=".85"/><rect x="42" y="36" width="16" height="18" fill="${w}"/><ellipse cx="50" cy="30" rx="10" ry="12" fill="${w}"/><rect x="38" y="74" width="24" height="18" rx="3" fill="${w}" opacity=".7"/>`,
    jar: `<rect x="24" y="60" width="52" height="46" rx="10" fill="${w}"/><rect x="22" y="46" width="56" height="18" rx="6" fill="${a}"/><rect x="36" y="76" width="28" height="14" rx="3" fill="${a}" opacity=".35"/>`,
    compact: `<ellipse cx="50" cy="80" rx="34" ry="12" fill="${a}" opacity=".5"/><rect x="16" y="56" width="68" height="24" rx="12" fill="${w}"/><circle cx="50" cy="60" r="20" fill="${a}" opacity=".6"/>`,
    lipstick: `<rect x="38" y="62" width="24" height="48" rx="3" fill="${w}"/><rect x="40" y="44" width="20" height="20" fill="${a}" opacity=".6"/><path d="M42 44V26l16-8v26z" fill="${a}"/>`,
    tint: `<rect x="38" y="40" width="24" height="70" rx="6" fill="${a}" opacity=".75"/><rect x="40" y="16" width="20" height="26" rx="4" fill="${w}"/>`,
  };
  return `<svg viewBox="0 0 100 120" aria-hidden="true">${m[s] || m.bottle}</svg>`;
}
const picture = (p, eager) => p.images[0]
  ? `<img src="${esc(p.images[0])}" alt="${esc(p.name + " " + p.brand)}" width="800" height="1000" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`
  : art(p.shape);

/* ---------- khối giao diện dùng chung ---------- */
function card(p) {
  const tags = [];
  if (p.sale) tags.push(`<span class="tag sale">−${pct(p)}%</span>`);
  if (p.isNew) tags.push(`<span class="tag new">Mới về</span>`);
  if (p.pop >= 10 && tags.length < 2) tags.push(`<span class="tag">Bán chạy</span>`);
  return `<article class="card" data-id="${p.id}">
  <div class="shot" style="background:${p.tint}">
    <a href="${p.url}" tabindex="-1" aria-hidden="true">${picture(p)}</a>
    ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
    <button class="add" data-add="${p.id}" aria-label="Thêm ${esc(p.name)} vào giỏ">Thêm vào giỏ</button>
  </div>
  <div class="meta"><a class="brand" href="${brandUrl(p.brand)}">${esc(p.brand)}</a><span class="vol">${esc(p.origin)} · ${esc(p.vol)}</span></div>
  <h3><a href="${p.url}">${esc(p.name)}</a></h3>
  ${p.actives.length ? `<div class="actives">${p.actives.slice(0, 2).map(a => `<span>${esc(a)}</span>`).join("")}</div>` : ""}
  <div class="prices"><span class="price${p.sale ? " on-sale" : ""}">${vnd(priceOf(p))}</span>${p.sale ? `<s>${vnd(p.price)}</s>` : ""}</div>
</article>`;
}
const grid = (list, cls = "") => `<div class="grid ${cls}">${list.map(card).join("")}</div>`;

function crumbs(items) {
  const html = `<nav class="crumbs" aria-label="Đường dẫn">${items.map((c, i) =>
    (i ? `<span aria-hidden="true">›</span>` : "") + (c.url && i < items.length - 1 ? `<a href="${c.url}">${esc(c.name)}</a>` : `<span>${esc(c.name)}</span>`)).join("")}</nav>`;
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: BASE + (c.url || "/") })) };
  return { html, ld };
}
const HOME = { name: "Trang chủ", url: "/" };

function needTiles(current) {
  return `<div class="needs">${T.needs.map(n => `<a class="need" href="${needUrl(n.name)}"${current === n.name ? ' aria-current="page"' : ""}><b>${esc(n.name)}</b><span>${esc(n.hint)}</span></a>`).join("")}</div>`;
}

function layout({ title, desc, url, body, ld = [], noindex = false, image, nav }) {
  const full = title === SITE.name ? `${SITE.name} – ${SITE.tagline} chính hãng` : `${title} | ${SITE.name}`;
  const navLinks = [
    ["/skincare/", "Skincare"], ["/makeup/", "Makeup"], ["/nhu-cau/", "Theo nhu cầu"], ["/thuong-hieu/", "Thương hiệu"],
    ["/hang-moi-ve/", "Hàng mới về"], ["/ban-chay/", "Bán chạy"], ["/khuyen-mai/", "Khuyến mãi", "sale"], ["/cua-hang/", "Tất cả sản phẩm"], ["/don-hang/", "Tra cứu đơn"],
  ];
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}${url}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}${url}">
<meta property="og:locale" content="vi_VN">
${image ? `<meta property="og:image" content="${esc(image.startsWith("http") ? image : BASE + image)}">` : ""}
<meta name="theme-color" content="#fbf8f5">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;0,600;1,500&family=Be+Vietnam+Pro:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/style.css">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<header class="site-head">
  <div class="wrap bar">
    <a class="logo" href="/">Luna <i>Cosmetics</i><small>${esc(SITE.tagline)}</small></a>
    <form class="search" action="/cua-hang/" method="get" role="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr" for="q">Tìm sản phẩm</label>
      <input id="q" name="q" type="search" placeholder="Tìm serum, retinol, kem chống nắng…" autocomplete="off">
    </form>
    <button class="bag-btn" id="openBag" type="button" aria-label="Mở giỏ hàng">Giỏ hàng <b id="bagCount">0</b></button>
  </div>
  <nav class="wrap nav" aria-label="Danh mục">${navLinks.map(([h, l, c]) => `<a href="${h}"${c ? ` class="${c}"` : ""}${nav === h ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
</header>
<div class="strip"><div class="wrap">
  <span>Chuyển khoản trước – miễn phí giao hàng toàn quốc</span>
  <span>Hàng có sẵn, giao 1–3 ngày</span>
  <span>Cam kết chính hãng</span>
</div></div>
<main>
${body}
</main>
<footer class="site-foot">
  <div class="wrap foot">
    <div>
      <a class="logo" href="/">Luna <i>Cosmetics</i></a>
      <p>${esc(SITE.description)}</p>
    </div>
    <div><h2>Mua sắm</h2><ul>
      <li><a href="/skincare/">Skincare</a></li><li><a href="/makeup/">Makeup</a></li>
      <li><a href="/hang-moi-ve/">Hàng mới về</a></li><li><a href="/khuyen-mai/">Khuyến mãi</a></li><li><a href="/thuong-hieu/">Thương hiệu</a></li>
    </ul></div>
    <div><h2>Chính sách</h2><ul>
      ${T.policies.map(x => `<li><a href="/chinh-sach/${x.slug}/">${esc(x.title)}</a></li>`).join("")}
    </ul></div>
    <div><h2>Liên hệ</h2><ul>
      <li>Hotline / Zalo: ${esc(SITE.phone)}</li>
      <li>${esc(SITE.email)}</li>
      <li>${esc(SITE.address)}</li>
      <li><a href="/don-hang/">Tra cứu đơn hàng</a></li>
      <li><a href="/lien-he/">Trang liên hệ</a></li>
      ${SITE.facebook ? `<li><a href="${esc(SITE.facebook)}" rel="noopener">Facebook</a></li>` : ""}
      ${SITE.tiktok ? `<li><a href="${esc(SITE.tiktok)}" rel="noopener">TikTok</a></li>` : ""}
      ${SITE.instagram ? `<li><a href="${esc(SITE.instagram)}" rel="noopener">Instagram</a></li>` : ""}
    </ul></div>
  </div>
  <div class="wrap copyline">© ${new Date().getFullYear()} ${esc(SITE.name)}. Mỹ phẩm chính hãng.</div>
</footer>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="Giỏ hàng">
  <div class="dh"><h2>Giỏ hàng</h2><button class="x" id="closeBag" type="button" aria-label="Đóng">×</button></div>
  <div class="db" id="dBody"></div>
  <div class="df" id="dFoot"></div>
</aside>
<script src="/assets/data.js"></script>
<script src="/assets/app.js"></script>
</body>
</html>`;
}

/* ---------- ghi file ---------- */
const pages = []; // cho sitemap
function write(url, html, { sitemap = true, priority = 0.6 } = {}) {
  const file = url.endsWith("/") ? path.join(OUT, url, "index.html") : path.join(OUT, url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  if (sitemap) pages.push({ url, priority });
}

function listingPage({ url, title, h1, intro, list, trail, chips = "", extra = "", nav, priority = 0.7, metaDesc }) {
  const bc = crumbs([HOME, ...trail]);
  const sorted = [...list].sort((a, b) => b.pop - a.pop);
  const body = `<div class="wrap">
  ${bc.html}
  <header class="page-head">
    <h1 class="display">${esc(h1 || title)}</h1>
    ${intro ? `<p class="lead">${intro}</p>` : ""}
  </header>
  ${chips}
  <p class="result">${sorted.length} sản phẩm</p>
  ${sorted.length ? grid(sorted) : `<p class="nores">Sản phẩm sẽ sớm cập nhật.</p>`}
  ${extra}
</div>`;
  const ld = [bc.ld, { "@context": "https://schema.org", "@type": "ItemList", itemListElement: sorted.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: BASE + p.url, name: p.name })) }];
  write(url, layout({ title, desc: metaDesc || `${title} chính hãng tại ${SITE.name}: ${sorted.slice(0, 3).map(p => p.name).join(", ")}${sorted.length > 3 ? "…" : ""}. Chuyển khoản trước miễn phí giao hàng.`, url, body, ld, nav }), { priority });
}

/* ================= TẠO TRANG ================= */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* Trang chủ */
{
  const best = [...P].sort((a, b) => b.pop - a.pop).slice(0, 4);
  const news = P.filter(p => p.isNew).slice(0, 4);
  const sales = P.filter(p => p.sale).sort((a, b) => pct(b) - pct(a)).slice(0, 4);
  const o = SITE.order;
  const body = `<div class="wrap">
  <section class="hero">
    <div>
      <h1 class="display">Làn da khoẻ<br>bắt đầu từ <em>những điều dịu dàng</em></h1>
      <p class="lead">Skincare và makeup cao cấp chọn lọc từ Hàn, Nhật, Pháp. Hàng có sẵn tại kho TP.HCM, đặt là giao.</p>
      <a class="btn" href="/cua-hang/">Xem tất cả sản phẩm</a>
    </div>
    <div class="hero-card">
      <h2>Chọn cách thanh toán</h2>
      <div class="pay-compare">
        <div class="pc good"><strong>Chuyển khoản</strong>Miễn phí ship<ul><li>Giao ưu tiên</li><li>Tặng mẫu thử</li></ul></div>
        <div class="pc"><strong>COD</strong>Ship ${vnd(o.shipFee)} + phí thu hộ<ul><li>Đơn từ ${vnd(o.codDepositFrom)} cần cọc ${Math.round(o.codDepositRate * 100)}%</li></ul></div>
      </div>
    </div>
  </section>
  <section class="section"><div class="sec-head"><h2>Mua theo nhu cầu</h2><a href="/nhu-cau/">Xem tất cả</a></div>${needTiles()}</section>
  <section class="section"><div class="sec-head"><h2>Bán chạy</h2><a href="/ban-chay/">Xem thêm</a></div>${grid(best, "row4")}</section>
  ${news.length ? `<section class="section"><div class="sec-head"><h2>Hàng mới về</h2><a href="/hang-moi-ve/">Xem thêm</a></div>${grid(news, "row4")}</section>` : ""}
  ${sales.length ? `<section class="section"><div class="sec-head"><h2>Đang khuyến mãi</h2><a href="/khuyen-mai/">Xem thêm</a></div>${grid(sales, "row4")}</section>` : ""}
  <section class="section"><div class="sec-head"><h2>Thương hiệu</h2><a href="/thuong-hieu/">Tất cả thương hiệu</a></div>
    <div class="brands">${BRANDS.map(b => `<a href="${brandUrl(b)}">${esc(b)}</a>`).join("")}</div></section>
</div>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Store", name: SITE.name, url: BASE + "/", description: SITE.description, telephone: SITE.phone, email: SITE.email,
      address: { "@type": "PostalAddress", addressLocality: SITE.address, addressCountry: "VN" }, currenciesAccepted: "VND", paymentAccepted: "Chuyển khoản, COD" },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: BASE + "/" },
  ];
  write("/", layout({ title: SITE.name, desc: SITE.description, url: "/", body, ld }), { priority: 1 });
}

/* Cửa hàng (bộ lọc đầy đủ) */
{
  const bc = crumbs([HOME, { name: "Tất cả sản phẩm", url: "/cua-hang/" }]);
  const body = `<div class="wrap">
  ${bc.html}
  <header class="page-head"><h1 class="display">Tất cả sản phẩm</h1>
    <p class="lead">Lọc theo nhu cầu da, thương hiệu, hoạt chất, loại da và khoảng giá để tìm đúng sản phẩm cho bạn.</p></header>
  <div class="layout" id="shop">
    <aside class="filters" id="filters" aria-label="Bộ lọc">
      <div class="fhead"><h2>Bộ lọc</h2><button class="x" id="closeF" type="button" aria-label="Đóng bộ lọc">×</button></div>
      <div id="fgroups"></div>
    </aside>
    <div>
      <div class="toolbar">
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" type="button" data-tab="all" aria-selected="true">Tất cả</button>
          <button class="tab" role="tab" type="button" data-tab="skincare" aria-selected="false">Skincare</button>
          <button class="tab" role="tab" type="button" data-tab="makeup" aria-selected="false">Makeup</button>
        </div>
        <div class="tools-r">
          <button class="fbtn" id="openF" type="button">Bộ lọc <span id="fCount"></span></button>
          <label class="sr" for="sort">Sắp xếp</label>
          <select class="sort" id="sort">
            <option value="pop">Bán chạy</option><option value="new">Mới nhất</option><option value="discount">Giảm nhiều nhất</option>
            <option value="asc">Giá thấp → cao</option><option value="desc">Giá cao → thấp</option>
          </select>
        </div>
      </div>
      <div class="flags" id="flags"></div>
      <div class="chips" id="chips"></div>
      <div class="active" id="active"></div>
      <p class="result" id="result">${P.length} sản phẩm</p>
      <div class="grid" id="grid">${[...P].sort((a, b) => b.pop - a.pop).map(card).join("")}</div>
    </div>
  </div>
</div>`;
  write("/cua-hang/", layout({ title: "Tất cả sản phẩm", desc: `Toàn bộ skincare và makeup chính hãng tại ${SITE.name}. Lọc theo nhu cầu da, thương hiệu, hoạt chất và giá.`, url: "/cua-hang/", body, ld: [bc.ld], nav: "/cua-hang/" }), { priority: 0.8 });
}

/* Danh mục + danh mục con */
for (const cat of ["skincare", "makeup"]) {
  const list = P.filter(p => p.cat === cat);
  const subs = uniq(list.map(p => p.sub));
  const chipNav = cur => `<nav class="chips" aria-label="Danh mục con"><a class="chip" href="/${cat}/"${cur ? "" : ' aria-current="page"'}>Tất cả</a>${subs.map(s => `<a class="chip" href="${subUrl(cat, s)}"${cur === s ? ' aria-current="page"' : ""}>${esc(s)}</a>`).join("")}</nav>`;
  listingPage({ url: `/${cat}/`, title: `${CAT_NAME[cat]} chính hãng`, h1: CAT_NAME[cat], intro: esc(T.categories[cat]), list, trail: [{ name: CAT_NAME[cat], url: `/${cat}/` }], chips: chipNav(), nav: `/${cat}/`, priority: 0.9 });
  for (const s of subs) {
    const sl = list.filter(p => p.sub === s);
    const intro = T.subs[s] || `${s} chính hãng, hàng có sẵn tại ${SITE.name}.`;
    listingPage({ url: subUrl(cat, s), title: `${s} chính hãng`, h1: s, intro: esc(intro), list: sl, trail: [{ name: CAT_NAME[cat], url: `/${cat}/` }, { name: s, url: subUrl(cat, s) }], chips: chipNav(s), nav: `/${cat}/`, priority: 0.8 });
  }
}

/* Nhu cầu */
{
  const bc = crumbs([HOME, { name: "Mua theo nhu cầu", url: "/nhu-cau/" }]);
  write("/nhu-cau/", layout({ title: "Mua mỹ phẩm theo nhu cầu da", desc: "Chọn skincare theo vấn đề da: mụn, thâm, lão hoá, cấp ẩm, da nhạy cảm, lỗ chân lông. Gợi ý hoạt chất phù hợp.", url: "/nhu-cau/", nav: "/nhu-cau/", ld: [bc.ld],
    body: `<div class="wrap">${bc.html}<header class="page-head"><h1 class="display">Mua theo nhu cầu</h1><p class="lead">Chọn vấn đề da bạn đang gặp, Luna gợi ý hoạt chất và sản phẩm phù hợp.</p></header>${needTiles()}</div>` }), { priority: 0.8 });
  for (const n of T.needs) {
    const list = P.filter(p => p.concerns.includes(n.name));
    const extra = `<section class="prose section"><h2>Nên dùng hoạt chất gì cho ${esc(n.name.toLowerCase())}?</h2>${n.guide.map(x => `<p>${esc(x)}</p>`).join("")}</section>`;
    listingPage({ url: needUrl(n.name), title: n.title, h1: n.title, intro: esc(n.intro), list, trail: [{ name: "Mua theo nhu cầu", url: "/nhu-cau/" }, { name: n.name, url: needUrl(n.name) }], chips: `<div class="section">${needTiles(n.name)}</div>`, extra, nav: "/nhu-cau/", metaDesc: n.intro });
  }
}

/* Thương hiệu */
{
  const bc = crumbs([HOME, { name: "Thương hiệu", url: "/thuong-hieu/" }]);
  write("/thuong-hieu/", layout({ title: "Thương hiệu mỹ phẩm", desc: `Các thương hiệu skincare và makeup chính hãng tại ${SITE.name}: ${BRANDS.join(", ")}.`, url: "/thuong-hieu/", nav: "/thuong-hieu/", ld: [bc.ld],
    body: `<div class="wrap">${bc.html}<header class="page-head"><h1 class="display">Thương hiệu</h1><p class="lead">Các thương hiệu Luna phân phối, cam kết chính hãng.</p></header><div class="brands">${BRANDS.map(b => `<a href="${brandUrl(b)}">${esc(b)} <small>(${P.filter(p => p.brand === b).length})</small></a>`).join("")}</div></div>` }), { priority: 0.7 });
  for (const b of BRANDS) {
    const list = P.filter(p => p.brand === b);
    const intro = (T.brands && T.brands[b]) || `Sản phẩm ${b} chính hãng (${uniq(list.map(p => p.origin)).join(", ")}), hàng có sẵn tại ${SITE.name}.`;
    listingPage({ url: brandUrl(b), title: `${b} chính hãng`, h1: b, intro: esc(intro), list, trail: [{ name: "Thương hiệu", url: "/thuong-hieu/" }, { name: b, url: brandUrl(b) }], nav: "/thuong-hieu/" });
  }
}

/* Hoạt chất */
for (const a of ACTIVES) {
  const list = P.filter(p => p.actives.includes(a));
  const intro = (T.actives && T.actives[a]) || `Sản phẩm chứa ${a} chính hãng tại ${SITE.name}.`;
  listingPage({ url: activeUrl(a), title: `Mỹ phẩm chứa ${a}`, h1: `Sản phẩm chứa ${a}`, intro: esc(intro), list, trail: [{ name: "Hoạt chất", url: "/cua-hang/" }, { name: a, url: activeUrl(a) }], priority: 0.6 });
}

/* Bộ sưu tập */
listingPage({ url: "/hang-moi-ve/", title: "Hàng mới về", intro: "Sản phẩm mới nhập kho, có sẵn và giao ngay.", list: P.filter(p => p.isNew), trail: [{ name: "Hàng mới về", url: "/hang-moi-ve/" }], nav: "/hang-moi-ve/", priority: 0.8 });
listingPage({ url: "/ban-chay/", title: "Sản phẩm bán chạy", intro: "Những món được khách Luna mua lại nhiều nhất.", list: P.filter(p => p.pop >= 8), trail: [{ name: "Bán chạy", url: "/ban-chay/" }], nav: "/ban-chay/", priority: 0.8 });
listingPage({ url: "/khuyen-mai/", title: "Khuyến mãi mỹ phẩm", h1: "Đang khuyến mãi", intro: "Giá tốt trong thời gian có hạn, số lượng có hạn.", list: P.filter(p => p.sale), trail: [{ name: "Khuyến mãi", url: "/khuyen-mai/" }], nav: "/khuyen-mai/", priority: 0.8 });

/* Trang sản phẩm */
for (const p of P) {
  const trail = [{ name: CAT_NAME[p.cat], url: `/${p.cat}/` }, { name: p.sub, url: subUrl(p.cat, p.sub) }, { name: p.name, url: p.url }];
  const bc = crumbs([HOME, ...trail]);
  const related = P.filter(x => x.id !== p.id).map(x => ({ x, s: (x.sub === p.sub ? 2 : 0) + x.concerns.filter(c => p.concerns.includes(c)).length * 2 + (x.cat === p.cat ? 1 : 0) + x.pop / 20 }))
    .sort((a, b) => b.s - a.s).slice(0, 4).map(r => r.x);
  const links = (arr, fn) => arr.map(v => `<a href="${fn(v)}">${esc(v)}</a>`).join(", ");
  const title = `${p.name} ${p.brand} ${p.vol}`;
  const desc = `${p.name} ${p.brand} chính hãng, giá ${vnd(priceOf(p))}. ${p.desc}`.slice(0, 158);
  const body = `<div class="wrap">
  ${bc.html}
  <div class="pdp">
    <div class="shot" style="background:${p.tint}">${picture(p, true)}
      ${p.sale || p.isNew ? `<div class="tags">${p.sale ? `<span class="tag sale">−${pct(p)}%</span>` : ""}${p.isNew ? `<span class="tag new">Mới về</span>` : ""}</div>` : ""}</div>
    <div>
      <a class="brand" href="${brandUrl(p.brand)}">${esc(p.brand)}</a>
      <h1 class="display">${esc(p.name)}</h1>
      <div class="prices"><span class="price${p.sale ? " on-sale" : ""}">${vnd(priceOf(p))}</span>${p.sale ? `<s>${vnd(p.price)}</s><span class="badge-off">−${pct(p)}%</span>` : ""}</div>
      <p>${esc(p.desc)}</p>
      ${p.inStock ? `<div class="buy" data-buy="${p.id}">
        <div class="qty"><button type="button" data-step="-1" aria-label="Giảm số lượng">−</button><output id="pq">1</output><button type="button" data-step="1" aria-label="Tăng số lượng">+</button></div>
        <button class="btn dark" type="button" data-add-qty="${p.id}">Thêm vào giỏ</button>
        <button class="btn" type="button" data-buy-now="${p.id}">Mua ngay</button>
      </div>` : `<p class="note">Tạm hết hàng. Nhắn Zalo ${esc(SITE.zalo)} để được báo khi có hàng.</p>`}
      <p class="pay-note"><strong>Chuyển khoản trước: miễn phí giao hàng.</strong> COD: ship ${vnd(SITE.order.shipFee)} + phí thu hộ ${vnd(SITE.order.codFee)}.</p>
      <dl class="facts">
        <dt>Thương hiệu</dt><dd><a href="${brandUrl(p.brand)}">${esc(p.brand)}</a></dd>
        <dt>Xuất xứ</dt><dd>${esc(p.origin)}</dd>
        <dt>Dung tích</dt><dd>${esc(p.vol)}</dd>
        <dt>Danh mục</dt><dd><a href="${subUrl(p.cat, p.sub)}">${esc(p.sub)}</a></dd>
        ${p.skin.length ? `<dt>Loại da</dt><dd>${esc(p.skin.join(", "))}</dd>` : ""}
        ${p.actives.length ? `<dt>Hoạt chất</dt><dd>${links(p.actives, activeUrl)}</dd>` : ""}
        ${p.concerns.length ? `<dt>Phù hợp</dt><dd>${links(p.concerns, needUrl)}</dd>` : ""}
      </dl>
      <div class="prose">
        <h2>Cách dùng</h2><p>${esc(p.howto)}</p>
        ${p.ingredients ? `<h2>Thành phần</h2><p>${esc(p.ingredients)}</p>` : ""}
      </div>
    </div>
  </div>
  <section class="section"><div class="sec-head"><h2>Có thể bạn cũng thích</h2></div>${grid(related, "row4")}</section>
</div>`;
  const product = {
    "@context": "https://schema.org", "@type": "Product", name: `${p.name} ${p.brand}`, description: p.desc, sku: `LUNA-${p.id}`,
    brand: { "@type": "Brand", name: p.brand }, category: `${CAT_NAME[p.cat]} > ${p.sub}`, countryOfOrigin: p.origin,
    ...(p.images.length ? { image: p.images.map(i => (i.startsWith("http") ? i : BASE + i)) } : {}),
    offers: { "@type": "Offer", url: BASE + p.url, priceCurrency: "VND", price: priceOf(p), itemCondition: "https://schema.org/NewCondition",
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@type": "Organization", name: SITE.name } },
  };
  write(p.url, layout({ title, desc, url: p.url, body, ld: [bc.ld, product], image: p.images[0] }), { priority: 0.9 });
}

/* Tra cứu đơn hàng (không đưa lên Google) */
{
  const bc = crumbs([HOME, { name: "Tra cứu đơn hàng", url: "/don-hang/" }]);
  write("/don-hang/", layout({ title: "Tra cứu đơn hàng", desc: `Theo dõi trạng thái đơn hàng ${SITE.name} bằng mã đơn và số điện thoại.`, url: "/don-hang/", noindex: true, nav: "/don-hang/", ld: [bc.ld],
    body: `<div class="wrap" id="track">${bc.html}
  <header class="page-head"><h1 class="display">Tra cứu đơn hàng</h1>
    <p class="lead">Nhập mã đơn (bắt đầu bằng LUNA, có trong màn hình đặt hàng thành công và tin nhắn của shop) cùng số điện thoại đặt hàng.</p></header>
  <div class="track-wrap">
    <form class="panel track-form" id="trackForm" novalidate>
      <div class="two">
        <label class="f" for="tCode">Mã đơn<input id="tCode" placeholder="LUNA30101234" autocomplete="off" autocapitalize="characters" required></label>
        <label class="f" for="tPhone">Số điện thoại<input id="tPhone" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" required></label>
      </div>
      <p class="err" id="tErr" role="alert"></p>
      <button class="btn" type="submit">Tra cứu</button>
    </form>
    <div id="myOrders"></div>
    <div id="trackResult" aria-live="polite"></div>
  </div>
  <p class="lead">Cần hỗ trợ? Nhắn Zalo ${esc(SITE.zalo)} kèm mã đơn.</p>
</div>` }), { sitemap: false });
}

/* Thanh toán (không đưa lên Google) */
write("/thanh-toan/", layout({ title: "Thanh toán", desc: "Thanh toán đơn hàng Luna Cosmetics.", url: "/thanh-toan/", noindex: true,
  body: `<div class="wrap" id="checkout"><div class="page-head"><h1 class="display">Thanh toán</h1></div><p class="lead">Đang tải giỏ hàng…</p></div>` }), { sitemap: false });

/* Chính sách & liên hệ */
for (const pol of T.policies) {
  const url = `/chinh-sach/${pol.slug}/`;
  const bc = crumbs([HOME, { name: pol.title, url }]);
  const html = pol.sections.map(s => `<h2>${esc(s.h)}</h2>${s.p.map(x => `<p>${esc(fill(x))}</p>`).join("")}${s.li ? `<ul>${s.li.map(x => `<li>${esc(fill(x))}</li>`).join("")}</ul>` : ""}`).join("");
  write(url, layout({ title: pol.title, desc: fill(pol.desc), url, ld: [bc.ld],
    body: `<div class="wrap">${bc.html}<article class="prose"><header class="page-head"><h1 class="display">${esc(pol.title)}</h1></header>${html}</article></div>` }), { priority: 0.3 });
}
function fill(s) {
  const o = SITE.order;
  return s.replace(/\{(\w+)\}/g, (_, k) => ({ shipFee: vnd(o.shipFee), codFee: vnd(o.codFee), codDepositFrom: vnd(o.codDepositFrom), codMax: vnd(o.codMax),
    codDepositRate: Math.round(o.codDepositRate * 100) + "%", zalo: SITE.zalo, phone: SITE.phone, email: SITE.email, name: SITE.name, address: SITE.address }[k] ?? `{${k}}`));
}
{
  const bc = crumbs([HOME, { name: "Liên hệ", url: "/lien-he/" }]);
  write("/lien-he/", layout({ title: "Liên hệ", desc: `Liên hệ ${SITE.name}: hotline/Zalo ${SITE.phone}, ${SITE.address}.`, url: "/lien-he/", ld: [bc.ld],
    body: `<div class="wrap">${bc.html}<article class="prose"><header class="page-head"><h1 class="display">Liên hệ</h1></header>
      <p>Cần tư vấn chọn sản phẩm hay kiểm tra đơn hàng, bạn nhắn Luna qua Zalo hoặc gọi hotline. Luna trả lời trong giờ làm việc, 9:00–21:00 mỗi ngày.</p>
      <dl class="facts"><dt>Hotline / Zalo</dt><dd>${esc(SITE.phone)}</dd><dt>Email</dt><dd>${esc(SITE.email)}</dd><dt>Địa chỉ</dt><dd>${esc(SITE.address)}</dd></dl></article></div>` }), { priority: 0.4 });
}

/* 404 */
write("/404.html", layout({ title: "Không tìm thấy trang", desc: "Trang không tồn tại.", url: "/404.html", noindex: true,
  body: `<div class="wrap done-box"><h1 class="display">Không tìm thấy trang</h1><p class="lead">Đường dẫn có thể đã thay đổi. Bạn thử tìm sản phẩm ở ô tìm kiếm phía trên.</p><p><a class="btn" href="/cua-hang/">Xem tất cả sản phẩm</a></p></div>` }), { sitemap: false });

/* Dữ liệu cho trình duyệt (giỏ hàng, bộ lọc, thanh toán) */
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
const pub = P.map(p => ({ id: p.id, cat: p.cat, sub: p.sub, brand: p.brand, origin: p.origin, name: p.name, vol: p.vol, price: p.price, sale: p.sale || 0,
  isNew: !!p.isNew, pop: p.pop, actives: p.actives, skin: p.skin, concerns: p.concerns, url: p.url, img: p.images[0] || "", shape: p.shape, tint: p.tint, inStock: p.inStock }));
const cfg = { ...SITE.order, zalo: SITE.zalo, shopName: SITE.name, carriers: SITE.carriers || [], supabase: SB.url && SB.anonKey ? SB : null };
fs.writeFileSync(path.join(OUT, "assets/data.js"),
  `window.LUNA=${JSON.stringify({ products: pub, cfg, needs: T.needs.map(n => ({ name: n.name, hint: n.hint })), art: ACCENT })};`);
for (const f of fs.readdirSync(path.join(ROOT, "assets"))) fs.copyFileSync(path.join(ROOT, "assets", f), path.join(OUT, "assets", f));
if (fs.existsSync(path.join(ROOT, "public"))) fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

/* sitemap + robots */
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${BASE}${p.url}</loc><lastmod>${TODAY}</lastmod><priority>${p.priority.toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /thanh-toan/\nDisallow: /admin/\n\nSitemap: ${BASE}/sitemap.xml\n`);

/* Trang admin */
fs.mkdirSync(path.join(OUT, "admin"), { recursive: true });
fs.writeFileSync(path.join(OUT, "admin/index.html"), fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8")
  .replace("__ADMIN_CONFIG__", JSON.stringify({ supabase: SB.url && SB.anonKey ? SB : null, site: SITE.url, shopName: SITE.name, carriers: SITE.carriers || [], taxonomy: { needs: T.needs.map(n => n.name), subs: Object.keys(T.subs) } }).replace(/</g, "\\u003c")));
fs.copyFileSync(path.join(ROOT, "admin/admin.js"), path.join(OUT, "admin/admin.js"));
fs.copyFileSync(path.join(ROOT, "admin/admin.css"), path.join(OUT, "admin/admin.css"));

console.log(`• Nguồn sản phẩm: ${fromDB ? "Supabase" : "data/products.json"}`);
console.log(`✓ Đã tạo ${pages.length} trang (+ thanh toán, 404) vào dist/ — ${P.length} sản phẩm, ${BRANDS.length} thương hiệu, ${ACTIVES.length} hoạt chất`);
