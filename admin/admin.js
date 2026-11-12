/* Luna Admin — đơn hàng, sản phẩm, chặn COD, cài đặt */
(() => {
  const CFG = window.ADMIN || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const vnd = n => (Number(n) || 0).toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "anh";
  // giống slug trong build.js để link sản phẩm đúng
  const pslug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/&/g, " va ").replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const normPhone = s => (s || "").replace(/[\s.\-]/g, "").replace(/^\+84/, "0");
  // Giảm giá: nhập theo % / số tiền / giá sau giảm → luôn lưu thành "giá sale"
  const r1000 = n => Math.round(n / 1000) * 1000;
  const DMODES = [["pct", "Giảm theo %", "%"], ["amount", "Giảm số tiền", "đ"], ["price", "Nhập giá sau giảm", "đ"]];
  const dUnit = m => (DMODES.find(x => x[0] === m) || DMODES[0])[2];
  const saleFrom = (price, mode, val) => {
    const v = Number(val), pr = Number(price);
    if (val === "" || val === null || val === undefined || !(v > 0)) return null;
    return mode === "pct" ? r1000(pr * (1 - v / 100)) : mode === "amount" ? Math.round(pr - v) : Math.round(v);
  };
  const valFrom = (price, sale, mode) => (!sale || !price ? "" : mode === "pct" ? Math.round((1 - sale / price) * 1000) / 10 : mode === "amount" ? price - sale : sale);
  // lỗi giảm giá (chuỗi rỗng = hợp lệ)
  const saleErr = (price, mode, val) => {
    if (val === "" || val === null || val === undefined) return "";
    const v = Number(val), sale = saleFrom(price, mode, val);
    if (mode === "pct" && !(v > 0 && v < 100)) return "phần trăm giảm phải từ 1 đến 99";
    if (!(sale > 0 && sale < Number(price))) return mode === "pct" ? "mức giảm quá nhỏ" : mode === "amount" ? "số tiền giảm phải nhỏ hơn giá gốc" : "giá sau giảm phải nhỏ hơn giá gốc";
    return "";
  };
  const dPreview = (price, mode, val) => {
    const sale = saleFrom(price, mode, val);
    if (!sale || !(price > 0) || saleErr(price, mode, val)) return "";
    return `Giá bán ${vnd(sale)} · giảm ${Math.round((1 - sale / price) * 100)}% (−${vnd(price - sale)})`;
  };
  let dMode = (() => { try { return localStorage.getItem("luna-admin-dmode") || "pct"; } catch (e) { return "pct"; } })();
  const fmtTime = t => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  if (!CFG.supabase || !window.supabase) { $("setup").hidden = false; return; }
  const sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);

  const ST = [["cho_thanh_toan", "Chờ thanh toán"], ["cho_xac_nhan", "Chờ xác nhận"], ["da_xac_nhan", "Đã xác nhận"], ["cho_hang", "Chờ hàng về"], ["dang_giao", "Đang giao"], ["hoan_thanh", "Hoàn thành"], ["bom_hang", "Bom hàng"], ["da_huy", "Đã huỷ"]];
  const stName = Object.fromEntries(ST);
  const OPEN = ["cho_thanh_toan", "cho_xac_nhan", "da_xac_nhan", "cho_hang", "dang_giao"];
  const SKIN = ["Da dầu", "Da khô", "Da hỗn hợp", "Da nhạy cảm", "Mọi loại da"];
  const SHAPES = [["dropper", "Lọ serum"], ["bottle", "Chai"], ["pump", "Chai vòi nhấn"], ["tube", "Tuýp"], ["jar", "Hũ"], ["compact", "Hộp phấn"], ["lipstick", "Son thỏi"], ["tint", "Son tint"]];

  let orders = [], products = [], blockedList = [];
  let oFilter = "open", oQuery = "", pQuery = "", bombing = null, editing = null, eImages = [], fresh = new Set(), audio = null;

  /* ---------- tiện ích ---------- */
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
  const fail = (e, what) => { console.error(e); toast(`${what || "Lỗi"}: ${e.message || e}`); };
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.15, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.6);
    } catch (e) {}
  }
  const needRebuild = v => { try { v ? localStorage.setItem("luna-admin-rebuild", "1") : localStorage.removeItem("luna-admin-rebuild"); } catch (e) {} $("rebuild").hidden = !v; };
  const rebuildPending = () => { try { return localStorage.getItem("luna-admin-rebuild") === "1"; } catch (e) { return false; } };

  /* ---------- đăng nhập ---------- */
  function showLogin() { $("app").hidden = true; $("login").hidden = false; }
  async function enter(session) {
    const { data, error } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (error || !data) {
      $("lErr").textContent = error ? `Không kiểm tra được quyền: ${error.message}` : "Tài khoản này chưa có quyền admin. Xem README, mục cấp quyền admin.";
      await sb.auth.signOut(); showLogin(); return;
    }
    $("login").hidden = true; $("app").hidden = false;
    $("who").textContent = session.user.email;
    needRebuild(rebuildPending());
    show("orders");
    subscribe();
    sb.from("inventory").select("stock,low_stock").then(({ data }) => { const n = (data || []).filter(r => r.stock <= r.low_stock).length; $("lowCount").textContent = n; $("lowCount").hidden = !n; });
  }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("lBtn"); btn.disabled = true; btn.textContent = "Đang đăng nhập…"; $("lErr").textContent = "";
    const { data, error } = await sb.auth.signInWithPassword({ email: $("lEmail").value.trim(), password: $("lPass").value });
    btn.disabled = false; btn.textContent = "Đăng nhập";
    if (error) { $("lErr").textContent = /invalid/i.test(error.message) ? "Sai email hoặc mật khẩu." : error.message; return; }
    enter(data.session);
  });
  $("logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  /* ---------- chuyển mục ---------- */
  const loaded = {};
  function show(view) {
    document.querySelectorAll("[data-view]").forEach(b => b.dataset.view === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
    ["orders", "products", "stock", "stats", "blocked", "settings"].forEach(v => ($(`v-${v}`).hidden = v !== view));
    if (!loaded[view]) { loaded[view] = true; ({ orders: loadOrders, products: loadProducts, stock: loadStock, stats: loadStats, blocked: loadBlocked, settings: loadSettings })[view](); }
    if (view === "orders") { fresh.clear(); $("newCount").hidden = true; document.title = "Luna Admin"; }
  }

  /* ================= ĐƠN HÀNG ================= */
  async function loadOrders() {
    $("oList").innerHTML = `<p class="loading">Đang tải đơn…</p>`;
    const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { $("oList").innerHTML = `<p class="err">Không tải được đơn: ${esc(error.message)}</p>`; return; }
    orders = data; renderOrders();
  }
  function renderOrders() {
    const cnt = s => orders.filter(o => o.status === s).length;
    const chips = [["open", `Cần xử lý`, orders.filter(o => OPEN.includes(o.status)).length], ["all", "Tất cả", orders.length], ...ST.map(([k, l]) => [k, l, cnt(k)])];
    $("oStatus").innerHTML = chips.map(([k, l, n]) => `<button type="button" class="chip" data-of="${k}" aria-pressed="${oFilter === k}">${l}<b>${n}</b></button>`).join("");
    const q = norm(oQuery);
    const list = orders.filter(o => (oFilter === "all" || (oFilter === "open" ? OPEN.includes(o.status) : o.status === oFilter))
      && (!q || norm(`${o.code} ${o.buyer_name} ${o.phone}`).includes(q)));
    $("oList").innerHTML = list.length ? list.map(orderCard).join("") : `<p class="loading">${orders.length ? "Không có đơn nào khớp." : "Chưa có đơn hàng. Đơn mới sẽ hiện ở đây ngay khi khách đặt."}</p>`;
  }
  function orderCard(o) {
    const money = o.method === "bank" || o.deposit > 0;
    return `<article class="o-card${fresh.has(o.id) ? " fresh" : ""}">
  <div class="o-top"><span><span class="o-code">${esc(o.code)}</span> <span class="st st-${o.status}">${stName[o.status]}</span></span><span class="o-time">${fmtTime(o.created_at)}</span></div>
  <div class="o-grid">
    <div>
      <p><strong>${esc(o.buyer_name)}</strong> · ${esc(o.phone)} <button type="button" class="linkish" data-copy="${esc(o.phone)}">Chép</button></p>
      <p class="muted">${esc(o.address)}${o.city ? ", " + esc(o.city) : ""}</p>
      ${o.note ? `<p>Khách ghi: ${esc(o.note)}</p>` : ""}
    </div>
    <ul class="o-items">${(o.items || []).map(i => `<li><span>${i.qty} × ${esc(i.name)}${i.vol ? ` (${esc(i.vol)})` : ""}${i.preorder ? ` <span class="st-chip warn">Order${i.lead ? ` · ${esc(i.lead)}` : ""}</span>` : ""}</span><span>${vnd(i.price * i.qty)}</span></li>`).join("")}</ul>
  </div>
  <div class="o-money">
    <span class="${o.method === "bank" ? "m-bank" : "m-cod"}">${o.method === "bank" ? "Chuyển khoản" : "COD"}</span>
    <span>Tổng <strong>${vnd(o.total)}</strong></span>
    ${o.method === "cod" && o.deposit ? `<span>Cọc ${vnd(o.deposit)} · thu khi giao ${vnd(o.total - o.deposit)}</span>` : ""}
    ${money ? `<label class="paid"><input type="checkbox" data-paid="${o.id}"${o.paid ? " checked" : ""}> Đã nhận ${o.method === "bank" ? "tiền" : "cọc"}</label>` : ""}
  </div>
  <div class="o-actions">
    <label class="sr" for="st${o.id}">Trạng thái</label>
    <select id="st${o.id}" data-status="${o.id}">${ST.map(([k, l]) => `<option value="${k}"${k === o.status ? " selected" : ""}>${l}</option>`).join("")}</select>
    <a href="https://zalo.me/${esc(o.phone)}" target="_blank" rel="noopener">Nhắn Zalo</a>
    <a href="tel:${esc(o.phone)}">Gọi</a>
    ${o.method === "cod" && o.status !== "bom_hang" ? `<button type="button" class="sm bomb" data-bomb="${o.id}">Bom hàng</button>` : ""}
  </div>
  <div class="o-ship">
    <label class="sr" for="cr${o.id}">Đơn vị vận chuyển</label>
    <select id="cr${o.id}" data-carrier="${o.id}"><option value="">Đơn vị vận chuyển…</option>${(CFG.carriers || []).map(c => `<option value="${esc(c.id)}"${c.id === o.carrier ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
    <label class="sr" for="tc${o.id}">Mã vận đơn</label>
    <input id="tc${o.id}" data-tcode="${o.id}" value="${esc(o.tracking_code || "")}" placeholder="Mã vận đơn" autocomplete="off">
    <button type="button" class="sm" data-msg="${o.id}">Chép tin báo khách</button>
  </div>
  ${bombing === o.id ? `<div class="confirm">Đánh dấu đơn ${esc(o.code)} là bom hàng và chặn COD số ${esc(o.phone)}? Khách vẫn đặt được nếu chuyển khoản trước.
    <div class="e-actions"><button type="button" class="btn danger sm" data-bomb-yes="${o.id}">Bom hàng & chặn COD</button><button type="button" class="btn ghost sm" data-bomb-no>Huỷ</button></div></div>` : ""}
  <label class="sr" for="an${o.id}">Ghi chú nội bộ</label>
  <textarea class="o-note" id="an${o.id}" data-anote="${o.id}" rows="1" placeholder="Ghi chú nội bộ: mã vận đơn, đã gọi lúc…">${esc(o.admin_note)}</textarea>
</article>`;
  }
  async function updateOrder(id, patch, msg) {
    const { data, error } = await sb.from("orders").update(patch).eq("id", id).select().single();
    if (error) { fail(error, "Không lưu được đơn"); renderOrders(); return null; }
    orders = orders.map(o => (o.id === id ? data : o)); renderOrders(); if (msg) toast(msg);
    return data;
  }
  function subscribe() {
    sb.channel("orders-new").on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, ({ new: o }) => {
      if (orders.some(x => x.id === o.id)) return;
      orders.unshift(o); fresh.add(o.id);
      if (loaded.orders) renderOrders();
      const n = fresh.size; $("newCount").textContent = n; $("newCount").hidden = $("v-orders").hidden ? false : true;
      document.title = `(${n}) Đơn mới · Luna Admin`;
      toast(`Đơn mới ${o.code}: ${o.buyer_name}, ${vnd(o.total)}`); beep();
    }).subscribe();
  }

  /* ================= SẢN PHẨM ================= */
  async function loadProducts() {
    $("pList").innerHTML = `<p class="loading">Đang tải sản phẩm…</p>`;
    const { data, error } = await sb.from("products").select("*").order("id");
    if (error) { $("pList").innerHTML = `<p class="err">Không tải được sản phẩm: ${esc(error.message)}</p>`; return; }
    products = data; renderProducts();
  }
  const rootOf = p => (p && p.variant_of ? products.find(x => x.id === p.variant_of) || p : p);
  const kidsOf = id => products.filter(k => k.variant_of === id).sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id);
  const priceTxt = p => (p.sale ? `<s class="muted">${vnd(p.price)}</s> <span class="on-sale">${vnd(p.sale)}</span> <span class="st-chip sale">−${Math.round((1 - p.sale / p.price) * 100)}%</span>` : vnd(p.price));
  /* ---- danh sách sản phẩm: lọc, sắp xếp, phân trang, chọn nhiều ---- */
  const PER = 50;
  const pF = (() => { try { return { brand: "", sub: "", status: "all", sort: "new", ...JSON.parse(localStorage.getItem("luna-admin-pf") || "{}"), page: 1 }; } catch (e) { return { brand: "", sub: "", status: "all", sort: "new", page: 1 }; } })();
  const pSel = new Set();
  const famOf = p => [p, ...kidsOf(p.id)];
  const minOf = p => Math.min(...famOf(p).map(m => m.sale || m.price));
  const discOf = p => Math.max(0, ...famOf(p).map(m => (m.sale ? 1 - m.sale / m.price : 0)));
  const P_STATUS = [
    ["all", "Tất cả", () => true],
    ["visible", "Đang hiện", p => p.visible],
    ["hidden", "Đang ẩn", p => !p.visible],
    ["out", "Hết hàng", p => !famOf(p).some(m => m.in_stock || m.preorder)],
    ["sale", "Đang giảm giá", p => famOf(p).some(m => m.sale)],
    ["new", "Mới về", p => p.is_new],
    ["order", "Hàng order", p => famOf(p).some(m => m.preorder)],
    ["noimg", "Thiếu ảnh", p => !(p.images || []).length],
    ["nodesc", "Thiếu mô tả", p => !(p.descr || "").trim()],
  ];
  function pFiltered() {
    const q = norm(pQuery).trim();
    const roots = products.filter(p => rootOf(p) === p);
    const words = q.split(/\s+/).filter(Boolean);
    const hay = p => norm(`${p.id} ${p.name} ${p.brand} ${p.sub} ${p.vol} ${p.origin} ${(p.actives || []).join(" ")} ${kidsOf(p.id).map(k => k.vol).join(" ")}`);
    const st = (P_STATUS.find(x => x[0] === pF.status) || P_STATUS[0])[2];
    const list = roots.filter(p => (!pF.brand || p.brand === pF.brand) && (!pF.sub || p.sub === pF.sub) && (!words.length || words.every(w => hay(p).includes(w))));
    return { roots, base: list, list: list.filter(st) };
  }
  function renderProducts() {
    const { roots, base, list } = pFiltered();
    const by = { new: (a, b) => b.id - a.id, old: (a, b) => a.id - b.id, name: (a, b) => a.name.localeCompare(b.name, "vi"), asc: (a, b) => minOf(a) - minOf(b), desc: (a, b) => minOf(b) - minOf(a), pop: (a, b) => (b.pop || 0) - (a.pop || 0) || b.id - a.id, disc: (a, b) => discOf(b) - discOf(a) };
    list.sort(by[pF.sort] || by.new);
    // bộ lọc
    const brands = [...new Set(roots.map(p => p.brand))].sort((a, b) => a.localeCompare(b, "vi"));
    const subs = [...new Set(roots.map(p => p.sub))].sort((a, b) => a.localeCompare(b, "vi"));
    $("pBrand").innerHTML = `<option value="">Mọi thương hiệu (${brands.length})</option>` + brands.map(b => `<option${b === pF.brand ? " selected" : ""}>${esc(b)}</option>`).join("");
    $("pSub").innerHTML = `<option value="">Mọi danh mục (${subs.length})</option>` + subs.map(b => `<option${b === pF.sub ? " selected" : ""}>${esc(b)}</option>`).join("");
    $("pSort").value = pF.sort;
    $("pStatus").innerHTML = P_STATUS.map(([k, l, f]) => { const n = base.filter(f).length; return k !== "all" && !n && pF.status !== k ? "" : `<button type="button" class="chip" data-pst="${k}" aria-pressed="${pF.status === k}">${l}<b>${n}</b></button>`; }).join("");
    const pages = Math.max(1, Math.ceil(list.length / PER));
    pF.page = Math.min(Math.max(1, pF.page), pages);
    const view = list.slice((pF.page - 1) * PER, pF.page * PER);
    const filtered = !!(pQuery || pF.brand || pF.sub || pF.status !== "all");
    $("pCount").textContent = `${filtered ? `${list.length} khớp bộ lọc / ` : ""}${roots.length} sản phẩm · ${products.length - roots.length} phân loại thêm${pages > 1 ? ` · trang ${pF.page}/${pages}` : ""}`;
    const stockBtn = p => `<button type="button" class="tg stock" data-tg="in_stock" data-pid="${p.id}" aria-pressed="${p.in_stock || !!p.preorder}">${p.preorder ? "Hàng order" : p.in_stock ? "Còn hàng" : "Hết hàng"}</button>`;
    $("pList").innerHTML = view.length ? view.map(p => {
      const kids = kidsOf(p.id);
      const warn = [!(p.images || []).length ? "Thiếu ảnh" : "", !(p.descr || "").trim() ? "Thiếu mô tả" : ""].filter(Boolean);
      return `<div class="p-row sel${p.visible ? "" : " off"}${pSel.has(p.id) ? " picked" : ""}">
      <input type="checkbox" class="p-ck" data-psel="${p.id}" aria-label="Chọn ${esc(p.name)}"${pSel.has(p.id) ? " checked" : ""}>
      <div class="p-thumb" style="background:${esc(p.tint)}">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : ""}</div>
      <div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-sub">#${p.id} · ${esc(p.brand)} · ${esc(p.sub)}${p.vol ? ` · ${esc(p.vol)}` : ""}${kids.length ? ` · <b>${kids.length + 1} phân loại</b>` : ""}${warn.map(w => ` <span class="st-chip warn">${w}</span>`).join("")}</div>
        <div class="p-flags">
          <button type="button" class="tg" data-tg="visible" data-pid="${p.id}" aria-pressed="${p.visible}">${p.visible ? "Đang hiện" : "Đang ẩn"}</button>
          ${stockBtn(p)}
          <button type="button" class="tg" data-tg="is_new" data-pid="${p.id}" aria-pressed="${p.is_new}">Mới về</button>
        </div>
      </div>
      <div class="p-right">
        <span class="price">${priceTxt(p)}</span>
        <button type="button" class="btn ghost sm" data-edit="${p.id}">Sửa</button>
      </div></div>${kids.map(k => `<div class="p-row sel child${p.visible ? "" : " off"}">
      <span></span><div class="p-thumb" aria-hidden="true">↳</div>
      <div><div class="p-name">${esc(k.vol || "Phân loại")}</div><div class="p-flags">${stockBtn(k)}</div></div>
      <div class="p-right"><span class="price">${priceTxt(k)}</span><button type="button" class="btn ghost sm" data-edit="${p.id}">Sửa</button></div></div>`).join("")}`;
    }).join("") : `<p class="loading">${products.length ? "Không có sản phẩm khớp bộ lọc." : "Chưa có sản phẩm. Bấm “Thêm sản phẩm” hoặc “Nhập từ web hãng”."}</p>`;
    // phân trang
    const nums = [];
    for (let n = 1; n <= pages; n++) if (n === 1 || n === pages || Math.abs(n - pF.page) <= 2) nums.push(n); else if (nums[nums.length - 1] !== "…") nums.push("…");
    $("pPager").innerHTML = pages > 1 ? `<button type="button" class="pg" data-pg="${pF.page - 1}"${pF.page === 1 ? " disabled" : ""}>‹ Trước</button>${nums.map(n => n === "…" ? `<span>…</span>` : `<button type="button" class="pg" data-pg="${n}"${n === pF.page ? ' aria-current="page"' : ""}>${n}</button>`).join("")}<button type="button" class="pg" data-pg="${pF.page + 1}"${pF.page === pages ? " disabled" : ""}>Sau ›</button>` : "";
    // thanh chọn nhiều
    [...pSel].forEach(id => { if (!products.some(p => p.id === id)) pSel.delete(id); });
    $("pBulk").hidden = !pSel.size;
    $("pSelN").textContent = `Đã chọn ${pSel.size} sản phẩm`;
    const allIn = list.length && list.every(p => pSel.has(p.id));
    $("pSelAll").textContent = allIn ? "" : `Chọn tất cả ${list.length} sản phẩm đang lọc`;
    $("pSelAll").hidden = allIn;
    try { localStorage.setItem("luna-admin-pf", JSON.stringify({ brand: pF.brand, sub: pF.sub, status: pF.status, sort: pF.sort })); } catch (e) {}
  }

  /* ---- sửa hàng loạt ---- */
  let bulkKind = "";
  const selRoots = () => products.filter(p => pSel.has(p.id) && rootOf(p) === p);
  const selFamily = () => selRoots().flatMap(famOf);
  function openBulk(kind) {
    bulkKind = kind;
    const n = pSel.size, box = $("pBulkForm");
    const subs = [...new Set([...(CFG.taxonomy?.subs || []), ...products.map(x => x.sub)])];
    const brands = [...new Set(products.map(x => x.brand))];
    const forms = {
      disc: `<p>Giảm giá cho ${n} sản phẩm và mọi phân loại của chúng.</p>
        <div class="disc"><label class="sr" for="bMode">Cách giảm</label><select id="bMode"><option value="pct">Giảm theo %</option><option value="amount">Giảm số tiền (đ)</option></select>
        <label class="sr" for="bVal">Mức giảm</label><span class="dval"><input id="bVal" type="number" min="0" step="any" placeholder="Ví dụ 15"><b id="bUnit">%</b></span></div>
        <label class="ckl"><input type="checkbox" id="bFromSale"> Tính trên giá đang bán (nếu đang có giảm giá) thay vì giá gốc</label>`,
      price: `<p>Tăng / giảm <strong>giá gốc</strong> của ${n} sản phẩm (và phân loại) theo %. Giá sale đang có đổi theo cùng tỉ lệ. Làm tròn tới 1.000đ.</p>
        <div class="disc"><label class="sr" for="bVal">Phần trăm</label><span class="dval"><input id="bVal" type="number" step="any" placeholder="10 = tăng 10%, −5 = giảm 5%"><b>%</b></span></div>`,
      cat: `<p>Đổi danh mục cho ${n} sản phẩm.</p><div class="two">
        <label class="f" for="bCat">Nhóm<select id="bCat"><option value="skincare">Skincare</option><option value="makeup">Makeup</option></select></label>
        <label class="f" for="bSub">Danh mục<input id="bSub" list="bSubs" placeholder="Serum, Toner…"></label></div>
        <datalist id="bSubs">${subs.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`,
      brand: `<p>Đổi thương hiệu cho ${n} sản phẩm.</p><label class="f" for="bBrand">Thương hiệu<input id="bBrand" list="bBrands"></label><datalist id="bBrands">${brands.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`,
      del: `<div class="confirm">Xoá vĩnh viễn ${n} sản phẩm cùng mọi phân loại và lịch sử kho của chúng? Không hoàn tác được. Đơn hàng cũ vẫn giữ nguyên tên và giá. Nếu chỉ muốn ngừng bán, hãy bấm <strong>Ẩn</strong>.</div>`,
    };
    box.innerHTML = forms[kind] ? `<form class="bulk-form" id="bForm2" novalidate>${forms[kind]}<p class="err" id="bErr2" role="alert"></p><div class="e-actions"><button class="btn${kind === "del" ? " danger" : ""} sm" type="submit" id="bGo">${kind === "del" ? `Xoá vĩnh viễn ${n} sản phẩm` : "Áp dụng"}</button><button class="btn ghost sm" type="button" id="bCancel">Huỷ</button></div><p class="hint" id="bPrev"></p></form>` : "";
    const f = box.querySelector("input:not([type=checkbox])"); if (f) f.focus();
    if (kind === "disc" || kind === "price") previewBulk();
  }
  function previewBulk() {
    if (!$("bPrev") || !$("bVal")) return;
    const v = $("bVal").value, fam = selFamily();
    if (v === "") { $("bPrev").textContent = ""; return; }
    const res = bulkCalc(fam, v);
    const ok = res.filter(r => r.patch), bad = res.length - ok.length;
    const ex = ok.slice(0, 2).map(r => `${r.p.name}${r.p.vol ? ` (${r.p.vol})` : ""}: ${vnd(r.p.sale || r.p.price)} → ${vnd(r.patch.sale ?? r.patch.price)}`).join(" · ");
    $("bPrev").textContent = `${ok.length} dòng sẽ đổi${bad ? `, ${bad} dòng bỏ qua (mức giảm lớn hơn giá)` : ""}. Ví dụ: ${ex}`;
  }
  function bulkCalc(fam, val) {
    const v = Number(val);
    return fam.map(p => {
      if (bulkKind === "price") {
        if (!v || v <= -100) return { p, patch: null };
        const f = 1 + v / 100, price = r1000(p.price * f), sale = p.sale ? r1000(p.sale * f) : null;
        return { p, patch: price > 0 ? { price, sale: sale && sale < price ? sale : null } : null };
      }
      const mode = $("bMode").value, base = $("bFromSale").checked && p.sale ? p.sale : p.price;
      const sale = mode === "pct" ? (v > 0 && v < 100 ? r1000(base * (1 - v / 100)) : 0) : Math.round(base - v);
      return { p, patch: v > 0 && sale > 0 && sale < p.price ? { sale } : null };
    });
  }
  async function runBulk(kind) {
    const roots = selRoots(), ids = roots.map(p => p.id), famIds = roots.flatMap(famOf).map(p => p.id);
    const done = async (q, msg) => { const { error } = await q; if (error) return fail(error, "Không lưu được"); await reloadProducts(); needRebuild(true); toast(msg); closeBulk(); };
    if (kind === "show") return done(sb.from("products").update({ visible: true }).in("id", ids), `Đã hiện ${ids.length} sản phẩm`);
    if (kind === "hide") return done(sb.from("products").update({ visible: false }).in("id", ids), `Đã ẩn ${ids.length} sản phẩm`);
    if (kind === "new") return done(sb.from("products").update({ is_new: true }).in("id", ids), `Đã gắn Mới về cho ${ids.length} sản phẩm`);
    if (kind === "unnew") return done(sb.from("products").update({ is_new: false }).in("id", ids), `Đã bỏ Mới về ${ids.length} sản phẩm`);
    if (kind === "undisc") return done(sb.from("products").update({ sale: null }).in("id", famIds), `Đã bỏ giảm giá ${ids.length} sản phẩm`);
    const err = m => { $("bErr2").textContent = m; };
    if (kind === "cat") { const sub = $("bSub").value.trim(); if (!sub) return err("Nhập danh mục."); return done(sb.from("products").update({ cat: $("bCat").value, sub }).in("id", ids), `Đã chuyển ${ids.length} sản phẩm sang ${sub}`); }
    if (kind === "brand") { const b = $("bBrand").value.trim(); if (!b) return err("Nhập thương hiệu."); return done(sb.from("products").update({ brand: b }).in("id", ids), `Đã đổi thương hiệu ${ids.length} sản phẩm`); }
    if (kind === "del") return done(sb.from("products").delete().in("id", ids), `Đã xoá ${ids.length} sản phẩm`).then(() => ids.forEach(id => pSel.delete(id)));
    if (kind === "disc" || kind === "price") {
      const v = $("bVal").value;
      if (v === "") return err(kind === "disc" ? "Nhập mức giảm." : "Nhập phần trăm.");
      if (kind === "disc" && $("bMode").value === "pct" && !(Number(v) > 0 && Number(v) < 100)) return err("Phần trăm giảm phải từ 1 đến 99.");
      const jobs = bulkCalc(roots.flatMap(famOf), v).filter(r => r.patch);
      if (!jobs.length) return err("Không có dòng nào đổi được với mức này.");
      $("bGo").disabled = true;
      let i = 0, okN = 0; const errs = [];
      const work = async () => { while (i < jobs.length) { const r = jobs[i++]; const { error } = await sb.from("products").update(r.patch).eq("id", r.p.id); if (error) errs.push(`${r.p.name}: ${error.message}`); else okN++; $("bGo").textContent = `Đang lưu ${okN}/${jobs.length}…`; } };
      await Promise.all([work(), work(), work(), work(), work(), work()]);
      await reloadProducts(); needRebuild(true);
      if (errs.length) { $("bGo").disabled = false; $("bGo").textContent = "Áp dụng"; return err(`Lưu được ${okN}, lỗi ${errs.length}: ${errs.slice(0, 2).join("; ")}`); }
      toast(kind === "disc" ? `Đã giảm giá ${okN} dòng sản phẩm` : `Đã đổi giá ${okN} dòng sản phẩm`); closeBulk();
    }
  }
  function closeBulk() { bulkKind = ""; $("pBulkForm").innerHTML = ""; }
  async function reloadProducts() { const { data, error } = await sb.from("products").select("*").order("id"); if (!error) products = data; renderProducts(); }

  /* ---- xuất / nhập file CSV ---- */
  const csvCell = v => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const CSV_HEAD = ["id", "thuoc_san_pham", "ten", "thuong_hieu", "danh_muc", "phan_loai", "gia_goc", "gia_sale", "giam_pct", "hien", "con_hang", "hang_order", "moi_ve", "anh", "link"];
  function exportProducts() {
    const { list } = pFiltered();
    const rows = list.flatMap(famOf).map(p => [p.id, p.variant_of || "", p.name, p.brand, p.sub, p.vol, p.price, p.sale || "", p.sale ? Math.round((1 - p.sale / p.price) * 100) : "", p.visible ? "co" : "khong", p.in_stock ? "co" : "khong", p.preorder ? "co" : "khong", p.is_new ? "co" : "khong", (p.images || []).length, `${CFG.site || ""}/san-pham/${pslug(`${rootOf(p).name} ${rootOf(p).brand}`)}/`]);
    const csv = "\ufeff" + [CSV_HEAD, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `san-pham-luna-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Đã xuất ${rows.length} dòng. Sửa cột gia_goc, gia_sale, hien, con_hang, moi_ve rồi tải lên lại.`);
  }
  function parseCsv(text) {
    text = text.replace(/^\ufeff/, "");
    const first = text.split(/\r?\n/)[0], sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  let csvPlan = [];
  async function readCsvFile(file) {
    const rows = parseCsv(await file.text());
    const head = (rows.shift() || []).map(h => norm(h).trim().replace(/\s+/g, "_"));
    const col = n => head.indexOf(n);
    if (col("id") < 0) { $("pCsvBox").innerHTML = `<p class="err">File cần có cột <b>id</b> (xuất file từ nút “Xuất file Excel” rồi sửa).</p>`; return; }
    const { data: inv } = await sb.from("inventory").select("product_id");
    const tracked = new Set((inv || []).map(r => r.product_id));
    const money = s => { const t = String(s || "").replace(/[^\d]/g, ""); return t ? Number(t) : null; };
    const yes = s => { const t = norm(s).trim(); return ["co", "x", "1", "yes", "true", "hien", "con"].includes(t) ? true : ["khong", "0", "no", "false", "an", "het", ""].includes(t) ? false : null; };
    const get = (r, n) => (col(n) >= 0 ? r[col(n)] ?? "" : undefined);
    csvPlan = []; const errs = []; let skipStock = 0;
    rows.forEach((r, k) => {
      const id = Number(get(r, "id")), p = products.find(x => x.id === id);
      if (!p) { errs.push(`Dòng ${k + 2}: không có sản phẩm id ${get(r, "id")}`); return; }
      const patch = {};
      const gp = get(r, "gia_goc"), gs = get(r, "gia_sale"), gpct = get(r, "giam_pct");
      const price = gp !== undefined && money(gp) ? money(gp) : p.price;
      if (price !== p.price) patch.price = price;
      let sale = p.sale || null;
      if (gs !== undefined) sale = money(gs);
      if ((gs === undefined || !money(gs)) && gpct !== undefined && Number(String(gpct).replace(",", ".")) > 0) sale = r1000(price * (1 - Number(String(gpct).replace(",", ".")) / 100));
      if (sale !== null && !(sale > 0 && sale < price)) { errs.push(`Dòng ${k + 2} (${p.name}): giá sale phải nhỏ hơn giá gốc`); return; }
      if ((sale || null) !== (p.sale || null)) patch.sale = sale;
      if (!p.variant_of) { const h = yes(get(r, "hien")); if (h !== null && get(r, "hien") !== undefined && h !== p.visible) patch.visible = h; const n = yes(get(r, "moi_ve")); if (n !== null && get(r, "moi_ve") !== undefined && n !== p.is_new) patch.is_new = n; }
      const st = yes(get(r, "con_hang"));
      if (st !== null && get(r, "con_hang") !== undefined && st !== p.in_stock) { if (tracked.has(p.id)) skipStock++; else patch.in_stock = st; }
      if (Object.keys(patch).length) csvPlan.push({ p, patch });
    });
    const label = { price: "giá gốc", sale: "giá sale", visible: "hiện/ẩn", is_new: "mới về", in_stock: "còn hàng" };
    $("pCsvBox").innerHTML = `<div class="panel csv-plan"><strong>File ${esc(file.name)}: ${csvPlan.length} dòng có thay đổi</strong>
      ${csvPlan.length ? `<ul>${csvPlan.slice(0, 8).map(({ p, patch }) => `<li>${esc(p.name)}${p.vol ? ` (${esc(p.vol)})` : ""}: ${Object.keys(patch).map(k => `${label[k]} ${k === "price" || k === "sale" ? (patch[k] ? vnd(patch[k]) : "bỏ") : patch[k] ? "có" : "không"}`).join(", ")}</li>`).join("")}${csvPlan.length > 8 ? `<li>… và ${csvPlan.length - 8} dòng nữa</li>` : ""}</ul>` : ""}
      ${skipStock ? `<p class="hint">${skipStock} dòng đổi “còn hàng” bị bỏ qua vì sản phẩm đang quản lý theo kho (đổi ở mục Kho).</p>` : ""}
      ${errs.length ? `<p class="err">${errs.length} dòng lỗi: ${esc(errs.slice(0, 3).join("; "))}${errs.length > 3 ? "…" : ""}</p>` : ""}
      <div class="e-actions">${csvPlan.length ? `<button class="btn sm" type="button" id="csvGo">Cập nhật ${csvPlan.length} dòng</button>` : ""}<button class="btn ghost sm" type="button" id="csvNo">Đóng</button></div></div>`;
  }
  async function applyCsv() {
    const btn = $("csvGo"); btn.disabled = true;
    let i = 0, okN = 0; const errs = [];
    const work = async () => { while (i < csvPlan.length) { const { p, patch } = csvPlan[i++]; const { error } = await sb.from("products").update(patch).eq("id", p.id); if (error) errs.push(`${p.name}: ${error.message}`); else okN++; btn.textContent = `Đang cập nhật ${okN}/${csvPlan.length}…`; } };
    await Promise.all([work(), work(), work(), work(), work(), work()]);
    await reloadProducts(); needRebuild(true);
    $("pCsvBox").innerHTML = errs.length ? `<p class="err">Cập nhật được ${okN}, lỗi ${errs.length}: ${esc(errs.slice(0, 3).join("; "))}</p>` : "";
    if (!errs.length) toast(`Đã cập nhật ${okN} dòng từ file`);
    csvPlan = [];
  }

  async function toggleProduct(id, field) {
    const p = products.find(x => x.id === id);
    if (field === "in_stock" && p.preorder) { toast("Đây là hàng order: luôn nhận đặt. Tắt “Hàng order” trong Sửa sản phẩm nếu muốn ngừng."); return; }
    if (field === "in_stock") {
      const { data: tracked } = await sb.from("inventory").select("stock").eq("product_id", id).maybeSingle();
      if (tracked) { toast(`Sản phẩm này đang quản lý theo kho (còn ${tracked.stock}). Vào mục Kho để nhập hàng hoặc kiểm kê.`); return; }
    }
    const { data, error } = await sb.from("products").update({ [field]: !p[field] }).eq("id", id).select().single();
    if (error) return fail(error, "Không lưu được");
    products = products.map(x => (x.id === id ? data : x)); renderProducts(); needRebuild(true);
  }

  let eVars = [];
  function openEditor(p) {
    p = rootOf(p);
    editing = p ? p.id : null;
    eVars = p ? kidsOf(p.id).map(k => ({ id: k.id, vol: k.vol || "", price: k.price, dval: valFrom(k.price, k.sale, dMode), in_stock: k.in_stock, preorder: !!k.preorder, del: false })) : [];
    eImages = p ? [...(p.images || [])] : [];
    p = p || { cat: "skincare", sub: "", brand: "", origin: "", name: "", vol: "", price: "", sale: "", is_new: true, in_stock: true, visible: true, pop: 5, actives: [], skin: [], concerns: [], descr: "", howto: "", ingredients: "", shape: "dropper", tint: "#f2e6d6" };
    const subs = [...new Set([...(CFG.taxonomy?.subs || []), ...products.map(x => x.sub)])];
    const brands = [...new Set(products.map(x => x.brand))];
    const ck = (name, opts, sel) => `<div class="cks">${opts.map(o => `<label><input type="checkbox" name="${name}" value="${esc(o)}"${(sel || []).includes(o) ? " checked" : ""}>${esc(o)}</label>`).join("")}</div>`;
    $("eTitle").textContent = editing ? "Sửa sản phẩm" : "Thêm sản phẩm";
    $("eDel").hidden = !editing; $("eDelConfirm").hidden = true; $("eErr").textContent = "";
    $("eForm").innerHTML = `
      <label class="f" for="e_name">Tên sản phẩm<input id="e_name" value="${esc(p.name)}" placeholder="Serum Niacinamide 10% làm sáng" required></label>
      <div class="two">
        <label class="f" for="e_brand">Thương hiệu<input id="e_brand" value="${esc(p.brand)}" list="dl_brand" required></label>
        <label class="f" for="e_origin">Xuất xứ<input id="e_origin" value="${esc(p.origin)}" placeholder="Hàn, Nhật, Pháp…"></label>
        <label class="f" for="e_cat">Nhóm<select id="e_cat"><option value="skincare"${p.cat === "skincare" ? " selected" : ""}>Skincare</option><option value="makeup"${p.cat === "makeup" ? " selected" : ""}>Makeup</option></select></label>
        <label class="f" for="e_sub">Danh mục<input id="e_sub" value="${esc(p.sub)}" list="dl_sub" placeholder="Serum, Toner, Môi…" required></label>
        <label class="f" for="e_vol">Dung tích / phân loại<input id="e_vol" value="${esc(p.vol)}" placeholder="30ml"></label>
        <label class="f" for="e_pop">Độ bán chạy (1–10)<input id="e_pop" type="number" min="1" max="10" value="${esc(p.pop)}"></label>
        <label class="f" for="e_price">Giá gốc (đ)<input id="e_price" type="number" min="0" step="1000" value="${esc(p.price)}" required></label>
      </div>
      <div class="f">Giảm giá <span class="hint">Để trống nếu không giảm. Chọn cách nhập rồi gõ số; web hiện giá sau giảm và nhãn −%.</span>
        <div class="disc">
          <label class="sr" for="e_dmode">Cách giảm</label><select id="e_dmode">${DMODES.map(([k, l]) => `<option value="${k}"${k === dMode ? " selected" : ""}>${l}</option>`).join("")}</select>
          <label class="sr" for="e_dval">Mức giảm</label><span class="dval"><input id="e_dval" type="number" min="0" step="any" inputmode="decimal" value="${esc(valFrom(p.price, p.sale, dMode))}" placeholder="${dMode === "pct" ? "Ví dụ 15" : "Ví dụ 50000"}"><b id="e_dunit">${dUnit(dMode)}</b></span>
          <button type="button" class="btn ghost sm" id="eDiscAll"${eVars.length ? "" : " hidden"}>Áp dụng cho mọi phân loại</button>
        </div>
        <span class="hint ok" id="e_dprev" aria-live="polite"></span>
      </div>
      <div class="f">Phân loại hàng
        <span class="hint">Thêm khi sản phẩm có nhiều dung tích / màu, mỗi loại có giá và tồn kho riêng. Phân loại đầu tiên là dung tích và giá ở trên.</span>
        <div class="vars" id="e_vars"></div>
        <div><button type="button" class="btn ghost sm" id="eAddVar">+ Thêm phân loại</button></div>
      </div>
      <datalist id="dl_sub">${subs.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <datalist id="dl_brand">${brands.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <div class="cks">
        <label><input type="checkbox" id="e_visible"${p.visible ? " checked" : ""}>Hiện trên web</label>
        <label><input type="checkbox" id="e_in_stock"${p.in_stock ? " checked" : ""}>Còn hàng</label>
        <label><input type="checkbox" id="e_is_new"${p.is_new ? " checked" : ""}>Hàng mới về</label>
        <label><input type="checkbox" id="e_preorder"${p.preorder ? " checked" : ""}>Hàng order (khách đặt rồi mới nhập)</label>
      </div>
      <label class="f" for="e_lead">Thời gian giao hàng order<input id="e_lead" value="${esc(p.lead_time || "")}" placeholder="7–14 ngày"></label>
      <div class="f">Ảnh sản phẩm (ảnh đầu tiên là ảnh chính)<div class="imgs" id="e_imgs"></div></div>
      <label class="f" for="e_actives">Hoạt chất (cách nhau bằng dấu phẩy)<input id="e_actives" value="${esc((p.actives || []).join(", "))}" placeholder="Niacinamide, Kẽm"></label>
      <div class="f">Loại da phù hợp${ck("skin", SKIN, p.skin)}</div>
      <div class="f">Nhu cầu${ck("concerns", CFG.taxonomy?.needs || [], p.concerns)}</div>
      <label class="f" for="e_descr">Mô tả (tự viết, đừng chép của hãng)<textarea id="e_descr">${esc(p.descr)}</textarea></label>
      <label class="f" for="e_howto">Cách dùng<textarea id="e_howto">${esc(p.howto)}</textarea></label>
      <label class="f" for="e_ingredients">Thành phần (không bắt buộc)<textarea id="e_ingredients">${esc(p.ingredients)}</textarea></label>
      <div class="two">
        <label class="f" for="e_tint">Màu nền thẻ<input id="e_tint" type="color" value="${esc(p.tint)}"></label>
        <label class="f" for="e_shape">Hình minh hoạ khi chưa có ảnh<select id="e_shape">${SHAPES.map(([k, l]) => `<option value="${k}"${k === p.shape ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>`;
    renderImgs(); renderVars(); syncDisc();
    $("editor").classList.add("on"); $("scrim").classList.add("on");
    setTimeout(() => $("e_name").focus(), 50);
  }
  function renderImgs() {
    $("e_imgs").innerHTML = eImages.map((u, i) => `<figure><img src="${esc(u)}" alt="">${i === 0 ? `<span class="first">Ảnh chính</span>` : `<span class="first" style="cursor:pointer" data-img-first="${i}">Đặt làm chính</span>`}<button type="button" data-img-rm="${i}" aria-label="Xoá ảnh">×</button></figure>`).join("")
      + `<label class="upload">+ Tải ảnh<input type="file" id="e_upload" accept="image/jpeg,image/png,image/webp" multiple></label>`;
  }
  async function upload(files) {
    const name = $("e_name").value || "san-pham";
    for (const [i, f] of [...files].entries()) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(`${f.name}: chỉ nhận ảnh JPG, PNG, WEBP`); continue; }
      if (f.size > 5 * 1024 * 1024) { toast(`${f.name}: ảnh lớn hơn 5MB, hãy giảm dung lượng trước`); continue; }
      toast(`Đang tải ${f.name}…`);
      const ext = f.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${slug(name)}-${Date.now()}-${i}.${ext}`;
      const { error } = await sb.storage.from("product-images").upload(path, f, { cacheControl: "31536000", upsert: false, contentType: f.type });
      if (error) { fail(error, "Không tải được ảnh"); continue; }
      eImages.push(sb.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      renderImgs(); toast("Đã tải ảnh lên");
    }
  }
  async function saveProduct() {
    const v = id => $(id).value.trim();
    const checked = n => [...$("eForm").querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.value);
    const price = parseInt(v("e_price"), 10), sale = saleFrom(price, dMode, v("e_dval")), sErr = price > 0 ? saleErr(price, dMode, v("e_dval")) : "";
    const err = [];
    if (v("e_name").length < 3) err.push("Nhập tên sản phẩm.");
    if (!v("e_brand")) err.push("Nhập thương hiệu.");
    if (!v("e_sub")) err.push("Nhập danh mục.");
    if (!(price > 0)) err.push("Nhập giá gốc.");
    if (sErr) err.push(`Giảm giá: ${sErr}.`);
    const live = eVars.filter(x => !x.del);
    if (live.length && !v("e_vol")) err.push("Có phân loại: hãy ghi dung tích / tên cho phân loại đầu tiên.");
    live.forEach((x, i) => {
      const pr = Number(x.price), e2 = pr > 0 ? saleErr(pr, dMode, x.dval) : "";
      if (!String(x.vol).trim()) err.push(`Phân loại ${i + 2}: nhập dung tích / tên.`);
      if (!(pr > 0)) err.push(`Phân loại ${i + 2}: nhập giá.`);
      if (e2) err.push(`Phân loại ${i + 2}: ${e2}.`);
    });
    const labels = [v("e_vol"), ...live.map(x => String(x.vol).trim())].filter(Boolean).map(norm);
    if (new Set(labels).size < labels.length) err.push("Hai phân loại đang trùng tên.");
    if ($("e_preorder").checked && !v("e_lead")) err.push("Hàng order: ghi thời gian giao (ví dụ 7–14 ngày).");
    if (err.length) { $("eErr").textContent = err.join(" "); return; }
    const row = {
      name: v("e_name"), brand: v("e_brand"), origin: v("e_origin"), cat: v("e_cat"), sub: v("e_sub"), vol: v("e_vol"),
      price, sale, pop: Math.max(1, Math.min(10, parseInt(v("e_pop"), 10) || 5)),
      visible: $("e_visible").checked, in_stock: $("e_in_stock").checked, is_new: $("e_is_new").checked,
      preorder: $("e_preorder").checked, lead_time: v("e_lead"),
      actives: v("e_actives").split(",").map(s => s.trim()).filter(Boolean), skin: checked("skin"), concerns: checked("concerns"),
      images: eImages, descr: v("e_descr"), howto: v("e_howto"), ingredients: v("e_ingredients"), tint: $("e_tint").value, shape: v("e_shape"),
    };
    const btn = $("eSave"); btn.disabled = true; btn.textContent = "Đang lưu…";
    const res = editing ? await sb.from("products").update(row).eq("id", editing).select().single() : await sb.from("products").insert(row).select().single();
    btn.disabled = false; btn.textContent = "Lưu sản phẩm";
    if (res.error) { btn.disabled = false; btn.textContent = "Lưu sản phẩm"; $("eErr").textContent = `Không lưu được: ${res.error.message}`; return; }
    const vErr = await saveVariants(res.data);
    const fresh = await sb.from("products").select("*").order("id");
    products = fresh.error ? (editing ? products.map(p => (p.id === editing ? res.data : p)) : [...products, res.data]) : fresh.data;
    renderProducts(); needRebuild(true);
    if (vErr.length) { editing = res.data.id; openEditor(res.data); $("eErr").textContent = `Đã lưu sản phẩm, nhưng phân loại lỗi: ${vErr.join("; ")}`; return; }
    closeEditor(); toast("Đã lưu sản phẩm");
  }
  async function saveVariants(main) {
    const errs = [];
    let pos = 1;
    for (const x of eVars) {
      try {
        if (x.del) { if (x.id) { const { error } = await sb.from("products").delete().eq("id", x.id); if (error) throw error; } continue; }
        const row = { vol: String(x.vol).trim(), price: Number(x.price), sale: saleFrom(x.price, dMode, x.dval), in_stock: !!x.in_stock, preorder: !!x.preorder, position: pos++ };
        const r = x.id ? await sb.from("products").update(row).eq("id", x.id).select().single()
          : await sb.from("products").insert({ ...row, variant_of: main.id, name: main.name, brand: main.brand, cat: main.cat, sub: main.sub }).select().single();
        if (r.error) throw r.error;
        x.id = r.data.id;
      } catch (e) { errs.push(`${x.vol || "phân loại"}: ${e.message}`); }
    }
    return errs;
  }
  function renderVars() {
    const live = eVars.map((x, i) => ({ x, i })).filter(o => !o.x.del);
    $("e_vars").innerHTML = live.map(({ x, i }, n) => `<div class="var-row">
      <label class="sr" for="vv${i}">Phân loại ${n + 2}</label><input id="vv${i}" data-vf="vol" data-vi="${i}" value="${esc(x.vol)}" placeholder="Phân loại ${n + 2}: 50ml">
      <label class="sr" for="vp${i}">Giá</label><input id="vp${i}" type="number" min="0" step="1000" data-vf="price" data-vi="${i}" value="${esc(x.price)}" placeholder="Giá gốc">
      <label class="sr" for="vs${i}">Mức giảm</label><span class="dval"><input id="vs${i}" type="number" min="0" step="any" data-vf="dval" data-vi="${i}" value="${esc(x.dval)}" placeholder="Giảm"><b>${dUnit(dMode)}</b></span>
      <label class="ckl"><input type="checkbox" data-vf="in_stock" data-vi="${i}"${x.in_stock ? " checked" : ""}>Còn hàng</label>
      <label class="ckl"><input type="checkbox" data-vf="preorder" data-vi="${i}"${x.preorder ? " checked" : ""}>Order</label>
      <button type="button" class="x" data-vdel="${i}" aria-label="Xoá phân loại ${esc(x.vol)}">×</button></div>`).join("")
      + (eVars.some(x => x.del && x.id) ? `<p class="hint">Phân loại bị xoá sẽ mất luôn lịch sử kho của phân loại đó khi bấm Lưu.</p>` : "");
  }
  async function deleteProduct() {
    const { error } = await sb.from("products").delete().eq("id", editing);
    if (error) { $("eErr").textContent = `Không xoá được: ${error.message}`; return; }
    products = products.filter(p => p.id !== editing && p.variant_of !== editing); renderProducts(); closeEditor(); needRebuild(true); toast("Đã xoá sản phẩm");
  }
  function closeEditor() { $("editor").classList.remove("on"); $("scrim").classList.remove("on"); editing = null; }

  /* ================= NHẬP TỪ WEB HÃNG ================= */
  const LI = window.LunaImport;
  let imp = { rows: [], busy: false, platform: "", query: "" };
  const ORIGINS = ["Mỹ", "Hàn", "Nhật", "Pháp", "Úc", "Đức", "Anh", "Thuỵ Sĩ", "Canada", "Ý", "Tây Ban Nha", "Thái Lan", "Việt Nam"];
  async function proxy(url) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/fetch-url", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    if (!r.ok) {
      let m = `HTTP ${r.status}`;
      try { const j = await r.clone().json(); if (j && j.error) m = j.error; } catch (e) {}
      const err = new Error(m); err.status = r.status; throw err;
    }
    return r;
  }
  async function getJson(url) { const t = await (await proxy(url)).text(); try { return JSON.parse(t); } catch (e) { return null; } }
  const iStatus = m => { const el = $("iErr"); if (el) { el.textContent = m; el.classList.toggle("muted", !!m && !/^Không|lỗi|Lỗi/.test(m)); } };

  // Web tự làm (không phải Shopify/Woo): tìm link sản phẩm trong sitemap
  async function sitemapProducts(pageUrl) {
    const o = new URL(pageUrl).origin, seen = new Set(), urls = [];
    let maps = [];
    try { const t = await (await proxy(`${o}/robots.txt`)).text(); maps = [...t.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]); } catch (e) {}
    if (!maps.includes(`${o}/sitemap.xml`)) maps.push(`${o}/sitemap.xml`);
    iStatus("Đang tìm sản phẩm trong sitemap…");
    for (let i = 0; i < maps.length && seen.size < 12; i++) {
      const m = maps[i]; if (seen.has(m)) continue; seen.add(m);
      let xml = ""; try { xml = await (await proxy(m)).text(); } catch (e) { continue; }
      const locs = LI.sitemapLocs(xml);
      if (/<sitemapindex/i.test(xml)) {
        // ưu tiên sitemap có chữ product / san-pham
        locs.sort((a, b) => (/product|san-pham|sanpham/i.test(b) ? 1 : 0) - (/product|san-pham|sanpham/i.test(a) ? 1 : 0)).forEach(x => maps.push(x));
      } else urls.push(...locs);
    }
    return LI.filterSitemap(urls, pageUrl);
  }
  // Đọc từng trang: trang sản phẩm thì lấy, trang danh mục thì đi tiếp vào link bên dưới (tối đa 300 trang)
  async function crawl(seeds, base) {
    const prefix = LI.listPrefix(base), queue = [...new Set(seeds)], seen = new Set(queue), out = [], order = [];
    let active = 0, pages = 0;
    const work = async () => {
      while (queue.length || active) {
        if (!queue.length || pages >= 300) { if (!active || pages >= 300) return; await new Promise(r => setTimeout(r, 150)); continue; }
        const u = queue.shift(); active++; pages++;
        try {
          const r = await proxy(u), html = await r.text(), fin = r.headers.get("X-Final-Url") || u;
          const got = LI.fromPage(html, fin, true);
          if (got.length) { got.forEach(x => { if (!out.some(y => y.sourceUrl === x.sourceUrl && y.name === x.name)) { out.push(x); order.push(u); } }); }
          else LI.linksUnder(html, fin, prefix).forEach(l => { if (!seen.has(l)) { seen.add(l); queue.push(l); } });
        } catch (e) { if (e.status === 401) { queue.length = 0; active--; throw e; } }
        active--;
        iStatus(`Đã xem ${pages} trang, tìm thấy ${out.length} sản phẩm…`);
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    return out;
  }

  async function loadSource(input) {
    const origin = new URL(input).origin;
    let lastErr = null;
    for (const s of LI.plan(input)) {
      try {
        if (s.kind === "shopify-one") {
          const j = await getJson(s.url);
          if (j && j.product) return { platform: "Shopify", items: LI.fromShopify(j.product, origin) };
        } else if (s.kind === "shopify-list") {
          const all = [];
          for (let page = 1; page <= 10; page++) {
            const j = await getJson(`${s.url}&page=${page}`);
            if (!j || !Array.isArray(j.products) || !j.products.length) break;
            all.push(...j.products); iStatus(`Đang đọc… ${all.length} sản phẩm`);
            if (j.products.length < 250) break;
          }
          if (all.length) return { platform: "Shopify", items: all.flatMap(p => LI.fromShopify(p, origin)) };
        } else if (s.kind === "woo") {
          const one = s.url.includes("slug="), all = [];
          for (let page = 1; page <= 10; page++) {
            const j = await getJson(one ? s.url : `${s.url}&page=${page}`);
            if (!Array.isArray(j) || !j.length) break;
            all.push(...j); iStatus(`Đang đọc… ${all.length} sản phẩm`);
            if (one || j.length < 100) break;
          }
          if (all.length) return { platform: "WooCommerce", items: all.flatMap(LI.fromWoo) };
        } else {
          const r = await proxy(s.url);
          const final = r.headers.get("X-Final-Url") || s.url, html = await r.text();
          const items = LI.fromPage(html, final);
          let links = LI.productLinks(html, final);
          if (items.length && links.length < 4) return { platform: "Trang sản phẩm", items };
          if (links.length < 2) links = [...await sitemapProducts(final), ...LI.linksUnder(html, final, LI.listPrefix(final))];
          if (links.length) {
            const got = await crawl(links, final);
            const noPrice = got.filter(x => !x.price).length;
            if (got.length) return { platform: `Web riêng của hãng${noPrice ? ` · ${noPrice} sản phẩm hãng không ghi giá (nhập giá bán để chọn)` : ""}`, items: got };
          }
          if (items.length) return { platform: "Trang sản phẩm", items };
        }
      } catch (e) {
        if (e.status === 401 || e.status === 403 && /admin|đăng nhập/i.test(e.message)) throw e;
        lastErr = e;
      }
    }
    throw new Error(lastErr && lastErr.status >= 500 ? `Không tải được trang (${lastErr.message}).` : "Không đọc được sản phẩm từ link này. Thử dán link của từng trang sản phẩm.");
  }

  function readOpts() {
    const v = id => ($(id) ? $(id).value.trim() : "");
    return {
      brand: v("iBrand"), origin: v("iOrigin"), cat: v("iCat") || "auto",
      priceMode: v("iPriceMode") || "keep", pct: Math.max(0, Math.min(90, Number(v("iPct")) || 0)),
      imgs: $("iImgs") ? $("iImgs").checked : true, detail: $("iDetail") ? $("iDetail").checked : true, visible: $("iVisible") ? $("iVisible").checked : false, skipDup: $("iSkipDup") ? $("iSkipDup").checked : true,
    };
  }
  async function openImport() {
    imp = { rows: [], busy: false, platform: "", query: "" };
    $("iBody").innerHTML = `
      <form id="iForm" class="panel" novalidate>
        <label class="f" for="iUrl">Link trang danh mục hoặc trang sản phẩm của hãng / nhà cung cấp<input id="iUrl" type="url" inputmode="url" placeholder="https://www.obagi.vn/collections/shop-all" required></label>
        <p class="hint">Hỗ trợ web làm bằng Shopify (ví dụ obagi.vn), WooCommerce và trang sản phẩm có dữ liệu chuẩn. Dán link danh mục để lấy nhiều sản phẩm một lần.</p>
        <p class="err" id="iErr" role="alert"></p>
        <button class="btn" type="submit" id="iLoad">Tải danh sách sản phẩm</button>
      </form>
      <div id="iResult"></div>`;
    $("iPanel").classList.add("on"); $("scrim").classList.add("on");
    setTimeout(() => $("iUrl").focus(), 50);
    try { await ensureProducts(); } catch (e) {}
  }
  function closeImport() { if (imp.busy) { toast("Đang nhập sản phẩm, vui lòng đợi xong"); return false; } $("iPanel").classList.remove("on"); $("scrim").classList.remove("on"); return true; }

  async function doLoad() {
    let url = $("iUrl").value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch (e) { iStatus("Không đúng định dạng link, ví dụ https://www.obagi.vn/collections/shop-all"); return; }
    const btn = $("iLoad"); btn.disabled = true; btn.textContent = "Đang tải…"; iStatus("Đang đọc trang…"); $("iResult").innerHTML = "";
    try {
      const { platform, items } = await loadSource(url);
      const have = new Set(products.map(p => LI.norm(p.name)));
      const seen = new Set();
      imp.platform = platform;
      const groups = new Map();
      items.filter(it => it.name && !seen.has(it.key) && seen.add(it.key)).forEach(it => { const k = it.group || it.key; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
      imp.rows = [...groups.values()].map(g => {
        const it = g[0], { sub } = LI.pickSub(it.name, it.type, it.tags), dup = have.has(LI.norm(it.name));
        return { item: it, variants: g.slice(1), name: it.name, vol: it.label || it.vol || "", sub, dup, sel: !dup && it.price > 0, manual: !it.price && !g.slice(1).length };
      });
      iStatus("");
      renderImport(url);
    } catch (e) { iStatus(e.message); }
    btn.disabled = false; btn.textContent = "Tải danh sách sản phẩm";
  }

  function renderImport(url) {
    const vendors = imp.rows.map(r => LI.cleanBrand(r.item.vendor)).filter(Boolean);
    const brand = vendors.sort((a, b) => vendors.filter(v => v === b).length - vendors.filter(v => v === a).length)[0] || LI.hostBrand(url);
    const subs = [...new Set([...LI.SUBS, ...(CFG.taxonomy?.subs || []), ...products.map(p => p.sub)])];
    $("iResult").innerHTML = `
      <div class="panel">
        <legend>Áp dụng cho tất cả sản phẩm nhập lần này</legend>
        <div class="two">
          <label class="f" for="iBrand">Thương hiệu<input id="iBrand" value="${esc(brand)}"></label>
          <label class="f" for="iOrigin">Xuất xứ<input id="iOrigin" list="iOrigins" placeholder="Mỹ, Hàn, Nhật…"><datalist id="iOrigins">${ORIGINS.map(o => `<option value="${o}">`).join("")}</datalist></label>
          <label class="f" for="iCat">Nhóm<select id="iCat"><option value="auto">Tự nhận theo danh mục</option><option value="skincare">Skincare</option><option value="makeup">Makeup</option></select></label>
          <div class="f">Giá bán
            <div class="price-mode"><select id="iPriceMode" aria-label="Cách tính giá bán"><option value="keep">Giữ giá hãng</option><option value="discount">Giảm so với giá hãng</option></select>
            <label class="pct" for="iPct"><input id="iPct" type="number" min="0" max="90" step="1" value="10" aria-label="Phần trăm giảm" disabled>%</label></div></div>
        </div>
        <div class="cks">
          <label><input type="checkbox" id="iImgs" checked>Tải ảnh về kho ảnh của shop</label>
          <label><input type="checkbox" id="iDetail" checked>Lấy thêm Cách dùng & Thành phần từ trang sản phẩm (chậm hơn)</label>
          <label><input type="checkbox" id="iVisible">Hiện ngay trên web</label>
          <label><input type="checkbox" id="iSkipDup" checked>Bỏ qua sản phẩm đã có</label>
        </div>
        <p class="hint">Mặc định nhập ở chế độ ẩn để bạn kiểm tra rồi bật “Hiện trên web”. Mô tả lấy từ web hãng nên được viết lại bằng lời của shop để tốt cho Google. Chỉ dùng ảnh khi được hãng hoặc nhà phân phối cho phép.</p>
      </div>
      <div class="i-bar">
        <label class="i-all"><input type="checkbox" id="iAll"> <span id="iCount"></span></label>
        <input id="iFilter" type="search" placeholder="Lọc theo tên…" aria-label="Lọc sản phẩm">
      </div>
      <div class="i-list" id="iList">${imp.rows.map((r, i) => `
        <div class="i-row${r.dup ? " dup" : ""}" data-row="${i}">
          <input type="checkbox" data-isel="${i}" aria-label="Chọn ${esc(r.name)}"${r.sel ? " checked" : ""}>
          <div class="p-thumb" style="background:var(--sand)">${r.item.images[0] ? `<img src="${esc(r.item.images[0])}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</div>
          <div class="i-main">
            <label class="sr" for="in${i}">Tên sản phẩm</label>
            <input id="in${i}" class="i-name" data-ifield="name" data-i="${i}" value="${esc(r.name)}">
            <div class="i-meta">
              <label class="sr" for="iv${i}">Dung tích</label><input id="iv${i}" class="i-vol" data-ifield="vol" data-i="${i}" value="${esc(r.vol)}" placeholder="Dung tích">
              <label class="sr" for="is${i}">Danh mục</label><select id="is${i}" data-ifield="sub" data-i="${i}">${subs.map(s => `<option${s === r.sub ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
              ${r.variants.length ? `<span class="st-chip">${r.variants.length + 1} phân loại: ${esc([r.vol, ...r.variants.map(v => v.label || v.vol)].filter(Boolean).join(", "))}</span>` : ""}
              ${r.dup ? `<span class="st-chip warn">Đã có</span>` : ""}${r.item.available ? "" : `<span class="st-chip">Hãng hết hàng</span>`}${r.manual && !r.item.price ? `<span class="st-chip bad">Web hãng không ghi giá – nhập giá bán</span>` : ""}
            </div>
          </div>
          <div class="i-price num" data-price="${i}">${r.manual ? `<label class="sr" for="ip${i}">Giá bán</label><input id="ip${i}" class="i-pin" type="number" min="1000" step="1000" inputmode="numeric" placeholder="Giá bán (đ)" data-iprice="${i}" value="${r.item.price || ""}">` : ""}</div>
        </div>`).join("")}</div>
      <div class="i-foot">
        <div id="iProg" class="hint"></div>
        <button class="btn" type="button" id="iRun">Nhập sản phẩm</button>
      </div>`;
    syncImport();
  }
  function syncImport() {
    if (!$("iList")) return;
    const o = readOpts();
    $("iPct").disabled = o.priceMode !== "discount";
    const q = LI.norm(imp.query);
    let shown = 0;
    imp.rows.forEach((r, i) => {
      const row = $("iList").querySelector(`[data-row="${i}"]`);
      const vis = !q || LI.norm(r.name).includes(q);
      row.hidden = !vis; if (vis) shown++;
      const { price, sale } = LI.calcPrice(r.item, o);
      const fam = [r.item, ...r.variants].map(x => { const c = LI.calcPrice(x, o); return c.sale || c.price; });
      row.classList.toggle("skip", o.skipDup && r.dup);
      if (r.manual) return;
      if (r.variants.length && new Set(fam).size > 1) { row.querySelector(`[data-price="${i}"]`).innerHTML = `<strong>${vnd(Math.min(...fam))}</strong><br><span class="muted">– ${vnd(Math.max(...fam))}</span>`; return; }
      row.querySelector(`[data-price="${i}"]`).innerHTML = price ? (sale ? `<s class="muted">${vnd(price)}</s><br><strong>${vnd(sale)}</strong>` : `<strong>${vnd(price)}</strong>`) : `<span class="muted">—</span>`;
      row.classList.toggle("skip", o.skipDup && r.dup);
    });
    const n = imp.rows.filter(r => r.sel && !(o.skipDup && r.dup) && r.item.price > 0).length;
    $("iCount").textContent = `${imp.platform}: ${imp.rows.length} sản phẩm${q ? ` (đang hiện ${shown})` : ""} · đã chọn ${n}`;
    $("iAll").checked = imp.rows.length > 0 && imp.rows.every(r => r.sel);
    $("iRun").textContent = n ? `Nhập ${n} sản phẩm` : "Chọn sản phẩm để nhập";
    $("iRun").disabled = !n || imp.busy;
  }

  async function fetchImage(src) {
    let u = src;
    if (/cdn\.shopify\.com|\/cdn\/shop\//.test(u)) u += (u.includes("?") ? "&" : "?") + "width=1200";
    try { const r = await fetch(u, { mode: "cors", referrerPolicy: "no-referrer" }); if (r.ok) return await r.blob(); } catch (e) {}
    return await (await proxy(u)).blob();
  }
  async function copyImages(urls, name) {
    const out = [];
    for (const [i, src] of urls.entries()) {
      try {
        const blob = await fetchImage(src);
        if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(blob.type) || blob.size > 5 * 1024 * 1024) continue;
        const ext = blob.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${slug(name)}-${Date.now().toString(36)}-${i}.${ext}`;
        const { error } = await sb.storage.from("product-images").upload(path, blob, { cacheControl: "31536000", upsert: false, contentType: blob.type });
        if (error) throw error;
        out.push(sb.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      } catch (e) { console.warn("Không chép được ảnh", src, e); }
    }
    return out.length ? out : urls; // chép lỗi hết thì giữ link ảnh gốc
  }
  async function runImport() {
    const o = readOpts();
    const chosen = imp.rows.filter(r => r.sel && !(o.skipDup && r.dup) && r.item.price > 0);
    if (!chosen.length || imp.busy) return;
    imp.busy = true; syncImport();
    $("iResult").querySelectorAll("input,select").forEach(el => (el.disabled = true));
    let ok = 0; const errs = [];
    for (const [n, r] of chosen.entries()) {
      $("iProg").textContent = `Đang nhập ${n + 1}/${chosen.length}: ${r.name}`;
      try {
        let extra = o.detail && r.item.extra ? r.item.extra : null;
        if (o.detail && !extra && r.item.sourceUrl) {
          $("iProg").textContent = `Đang nhập ${n + 1}/${chosen.length}: ${r.name} (đọc trang sản phẩm…)`;
          try { extra = LI.extractPage(await (await proxy(r.item.sourceUrl)).text()); } catch (e) { console.warn("Không đọc được trang sản phẩm", e); }
        }
        const p = LI.toProduct({ ...r.item, extra, name: r.name.trim() || r.item.name, vol: r.vol.trim() }, o);
        p.sub = r.sub;
        p.cat = o.cat !== "auto" ? o.cat : LI.MAKEUP.includes(r.sub) ? "makeup" : "skincare";
        if (p.cat === "makeup") p.concerns = [];
        p.shape = LI.SHAPE[r.sub] || p.shape; p.tint = LI.TINT[r.sub] || p.tint;
        if (o.imgs && p.images.length) p.images = await copyImages(p.images, p.name);
        const { data, error } = await sb.from("products").insert(p).select().single();
        if (error) throw error;
        products.push(data); r.dup = true; r.sel = false; ok++;
        for (const [k, v] of r.variants.entries()) {
          const pr = LI.calcPrice(v, o);
          const res2 = await sb.from("products").insert({ variant_of: data.id, name: data.name, brand: data.brand, cat: data.cat, sub: data.sub,
            vol: v.label || v.vol || `Phân loại ${k + 2}`, price: pr.price, sale: pr.sale, in_stock: v.available, position: k + 1 }).select().single();
          if (res2.error) errs.push(`${r.name} (${v.label || "phân loại"}): ${res2.error.message}`); else products.push(res2.data);
        }
        const el = $("iList").querySelector(`[data-row="${imp.rows.indexOf(r)}"]`);
        if (el) { el.classList.add("dup"); el.querySelector("[data-isel]").checked = false; el.querySelector(".i-meta").insertAdjacentHTML("beforeend", `<span class="st-chip good">Đã nhập</span>`); }
      } catch (e) { errs.push(`${r.name}: ${e.message}`); }
    }
    imp.busy = false;
    $("iResult").querySelectorAll("input,select").forEach(el => (el.disabled = false));
    $("iProg").innerHTML = `<strong>Đã nhập ${ok}/${chosen.length} sản phẩm.</strong>${o.visible ? "" : " Sản phẩm đang ẩn: vào danh sách sản phẩm, sửa lại rồi bật “Hiện trên web”."}${errs.length ? `<br><span class="err">Lỗi: ${errs.map(esc).join("; ")}</span>` : ""}`;
    loaded.stock = false; renderProducts(); syncImport();
    if (ok && o.visible) needRebuild(true);
    toast(`Đã nhập ${ok} sản phẩm`);
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.id === "pImport") openImport();
    else if (t.id === "iClose") closeImport();
    else if (t.id === "iRun") runImport();
  });
  document.addEventListener("submit", e => { if (e.target.id === "iForm") { e.preventDefault(); doLoad(); } });
  document.addEventListener("change", e => {
    const t = e.target, d = t.dataset;
    if (!t.closest || !t.closest("#iResult")) return;
    if (d.isel !== undefined) imp.rows[Number(d.isel)].sel = t.checked;
    else if (t.id === "iAll") imp.rows.forEach((r, i) => { const row = $("iList").querySelector(`[data-row="${i}"]`); if (!row.hidden) { r.sel = t.checked; row.querySelector("[data-isel]").checked = t.checked; } });
    else if (d.ifield) imp.rows[Number(d.i)][d.ifield] = t.value;
    else if (d.iprice !== undefined) {
      const r = imp.rows[Number(d.iprice)], v = Math.round(Number(t.value) || 0);
      r.item.price = v >= 1000 ? v : 0; r.item.salePrice = 0;
      r.sel = r.item.price > 0 && !r.dup; t.closest(".i-row").querySelector("[data-isel]").checked = r.sel;
      const chip = t.closest(".i-row").querySelector(".st-chip.bad"); if (chip) chip.hidden = !!r.item.price;
    }
    syncImport();
  });
  document.addEventListener("input", e => { if (e.target.id === "iFilter") { imp.query = e.target.value; syncImport(); } else if (e.target.id === "iPct") syncImport(); });

  /* ================= KHO ================= */
  let inv = {}, sold30 = {}, kFilter = "all", kQuery = "", kProduct = null;
  const KIND = { nhap: "Nhập hàng", ban: "Bán", huy_don: "Hoàn kho (huỷ đơn)", tra: "Khách trả hàng", hong: "Hàng hỏng / hết hạn", kiem_ke: "Kiểm kê" };
  const stockState = p => {
    const r = inv[p.id];
    if (!r) return { key: "untracked", label: "Chưa quản lý kho", cls: "" };
    if (r.stock < 0) return { key: "need", label: `Cần nhập ${-r.stock} (khách đã đặt)`, cls: "bad" };
    if (r.stock === 0 && p.preorder) return { key: "order", label: "Hàng order · 0", cls: "" };
    if (r.stock <= 0) return { key: "out", label: "Hết hàng", cls: "bad" };
    if (r.stock <= r.low_stock) return { key: "low", label: `Sắp hết · còn ${r.stock}`, cls: "warn" };
    return { key: "ok", label: `Còn ${r.stock}`, cls: "good" };
  };
  async function ensureProducts() { if (!products.length) { const { data, error } = await sb.from("products").select("*").order("id"); if (error) throw error; products = data; } }
  async function loadStock() {
    $("kList").innerHTML = `<p class="loading">Đang tải kho…</p>`;
    try {
      await ensureProducts();
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [a, b] = await Promise.all([
        sb.from("inventory").select("*"),
        sb.from("stock_moves").select("product_id,qty,kind").in("kind", ["ban", "huy_don"]).gte("created_at", since).limit(10000),
      ]);
      if (a.error) throw a.error; if (b.error) throw b.error;
      inv = Object.fromEntries(a.data.map(r => [r.product_id, r]));
      sold30 = {}; b.data.forEach(m => { sold30[m.product_id] = (sold30[m.product_id] || 0) - m.qty; });
      renderStock();
    } catch (e) { $("kList").innerHTML = `<p class="err">Không tải được kho: ${esc(e.message)}. Nếu báo thiếu bảng “inventory”, hãy chạy lại supabase/schema.sql.</p>`; }
  }
  function renderStock() {
    const tracked = products.filter(p => inv[p.id]);
    const units = tracked.reduce((n, p) => n + Math.max(0, inv[p.id].stock), 0);
    const value = tracked.reduce((n, p) => n + Math.max(0, inv[p.id].stock) * inv[p.id].cost, 0);
    const low = products.filter(p => stockState(p).key === "low"), out = products.filter(p => stockState(p).key === "out"), need = products.filter(p => stockState(p).key === "need");
    const needUnits = need.reduce((n, p) => n - inv[p.id].stock, 0);
    $("lowCount").textContent = low.length + out.length + need.length; $("lowCount").hidden = !(low.length + out.length + need.length);
    $("kTiles").innerHTML = [
      ["Đang quản lý kho", `${tracked.length}<small>/${products.length} sản phẩm</small>`],
      ["Tổng tồn", `${units.toLocaleString("vi-VN")}<small> sản phẩm</small>`],
      ["Giá trị tồn (giá vốn)", vnd(value)],
      ["Sắp hết", `${low.length}`, low.length ? "warn" : ""],
      ["Hết hàng", `${out.length}`, out.length ? "bad" : ""],
      ["Cần nhập cho khách order", `${needUnits}<small> sản phẩm · ${need.length} mã</small>`, need.length ? "bad" : ""],
    ].map(([l, v, c]) => `<div class="tile ${c || ""}"><span>${l}</span><strong>${v}</strong></div>`).join("");
    const counts = { all: products.length, need: need.length, low: low.length, out: out.length, order: products.filter(p => p.preorder).length, untracked: products.length - tracked.length };
    $("kFilter").innerHTML = [["all", "Tất cả"], ["need", "Cần nhập"], ["low", "Sắp hết"], ["out", "Hết hàng"], ["order", "Hàng order"], ["untracked", "Chưa quản lý kho"]]
      .map(([k, l]) => `<button type="button" class="chip" data-kf="${k}" aria-pressed="${kFilter === k}">${l}<b>${counts[k]}</b></button>`).join("");
    const q = norm(kQuery);
    const order = { need: 0, out: 1, low: 2, order: 3, ok: 4, untracked: 5 };
    const list = products.filter(p => (kFilter === "all" || (kFilter === "order" ? p.preorder : stockState(p).key === kFilter)) && (!q || norm(`${p.name} ${p.brand} ${inv[p.id]?.sku || ""}`).includes(q)))
      .sort((a, b) => order[stockState(a).key] - order[stockState(b).key] || a.name.localeCompare(b.name, "vi"));
    $("kList").innerHTML = list.length ? `<div class="k-head" aria-hidden="true"><span>Sản phẩm</span><span>Tồn kho</span><span>Giá vốn</span><span>Bán 30 ngày</span><span></span></div>` + list.map(p => {
      const r = inv[p.id], st = stockState(p), s30 = sold30[p.id] || 0;
      const days = r && r.stock > 0 && s30 > 0 ? Math.floor(r.stock / (s30 / 30)) : null;
      return `<div class="k-row${p.visible ? "" : " off"}">
        <div class="k-name"><div class="p-thumb" style="background:${esc(p.tint)}">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : ""}</div>
          <div><div class="p-name">${esc(p.name)}</div><div class="p-sub">${esc(p.brand)} · ${esc(p.vol)}${r && r.sku ? ` · SKU ${esc(r.sku)}` : ""}</div></div></div>
        <div><span class="st-chip ${st.cls}">${st.label}</span>${days !== null ? `<div class="p-sub">đủ bán ~${days} ngày</div>` : ""}</div>
        <div class="num">${r && r.cost ? vnd(r.cost) : `<span class="muted">—</span>`}</div>
        <div class="num">${s30}</div>
        <div class="k-act"><button type="button" class="btn sm" data-kin="${p.id}">Nhập hàng</button><button type="button" class="btn ghost sm" data-kopen="${p.id}">Chi tiết</button></div>
      </div>`;
    }).join("") : `<p class="loading">Không có sản phẩm nào.</p>`;
  }
  async function openStock(id, kind) {
    kProduct = products.find(p => p.id === id);
    const r = inv[id];
    $("kTitle").textContent = kProduct.name;
    $("kBody").innerHTML = `
      <div class="tiles compact">
        <div class="tile"><span>Tồn hiện tại</span><strong>${r ? r.stock : "—"}</strong></div>
        <div class="tile"><span>Giá vốn bình quân</span><strong>${r && r.cost ? vnd(r.cost) : "—"}</strong></div>
        <div class="tile"><span>Giá bán</span><strong>${vnd(kProduct.sale || kProduct.price)}</strong></div>
      </div>
      ${r && r.cost && (kProduct.sale || kProduct.price) ? `<p class="hint">Lãi gộp mỗi sản phẩm: ${vnd((kProduct.sale || kProduct.price) - r.cost)} (${Math.round((1 - r.cost / (kProduct.sale || kProduct.price)) * 100)}%)</p>` : ""}
      <form id="kForm" class="panel" novalidate>
        <label class="f" for="kKind">Loại<select id="kKind">
          <option value="nhap"${kind === "nhap" ? " selected" : ""}>Nhập hàng (cộng vào kho)</option>
          <option value="kiem_ke"${kind === "kiem_ke" ? " selected" : ""}>Kiểm kê (nhập số đếm thực tế)</option>
          <option value="hong">Hàng hỏng / hết hạn (trừ khỏi kho)</option>
          <option value="tra">Khách trả hàng (cộng vào kho)</option>
        </select></label>
        <div class="two">
          <label class="f" for="kQty"><span id="kQtyLabel">Số lượng</span><input id="kQty" type="number" min="0" step="1" inputmode="numeric" required></label>
          <label class="f" for="kCost" id="kCostWrap">Giá nhập mỗi cái (đ)<input id="kCost" type="number" min="0" step="1000" inputmode="numeric" placeholder="${r && r.cost ? r.cost : ""}"></label>
        </div>
        <label class="f" for="kNote">Ghi chú<input id="kNote" placeholder="Lô hàng, nhà cung cấp, lý do…"></label>
        <p class="err" id="kErr" role="alert"></p>
        <button class="btn" type="submit" id="kSave">Lưu</button>
      </form>
      <form id="kMeta" class="panel" novalidate>
        <legend>Thông tin kho</legend>
        <div class="two">
          <label class="f" for="kSku">Mã SKU<input id="kSku" value="${esc(r?.sku || "")}" placeholder="Mã vạch / mã nội bộ"></label>
          <label class="f" for="kLow">Báo sắp hết khi còn<input id="kLow" type="number" min="0" value="${r ? r.low_stock : 3}"></label>
        </div>
        <div class="e-actions"><button class="btn ghost" type="submit">Lưu thông tin</button>${r ? `<button class="btn ghost" type="button" id="kUntrack">Ngừng quản lý kho</button>` : ""}</div>
        <div id="kUntrackConfirm" class="confirm" hidden>Ngừng quản lý kho: sản phẩm sẽ bán không giới hạn, đơn mới không trừ kho nữa. Lịch sử nhập xuất vẫn giữ.
          <div class="e-actions"><button class="btn danger sm" type="button" id="kUntrackYes">Ngừng quản lý</button><button class="btn ghost sm" type="button" id="kUntrackNo">Huỷ</button></div></div>
      </form>
      <div><p class="eyebrow">Lịch sử nhập xuất</p><div id="kMoves" class="moves"><p class="loading">Đang tải…</p></div></div>`;
    syncKindForm();
    $("kPanel").classList.add("on"); $("scrim").classList.add("on");
    setTimeout(() => $("kQty").focus(), 50);
    const { data, error } = await sb.from("stock_moves").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(40);
    $("kMoves").innerHTML = error ? `<p class="err">${esc(error.message)}</p>` : data.length ? data.map(m => `<div class="move">
      <div><strong>${KIND[m.kind] || m.kind}</strong><div class="p-sub">${fmtTime(m.created_at)}${m.note ? " · " + esc(m.note) : ""}${m.unit_cost ? ` · giá nhập ${vnd(m.unit_cost)}` : ""}</div></div>
      <div class="num"><span class="${m.qty > 0 ? "plus" : "minus"}">${m.qty > 0 ? "+" : ""}${m.qty}</span><div class="p-sub">còn ${m.stock_after ?? "?"}</div></div></div>`).join("") : `<p class="hint">Chưa có lần nhập xuất nào.</p>`;
  }
  function syncKindForm() {
    const k = $("kKind").value;
    $("kQtyLabel").textContent = k === "kiem_ke" ? "Số đếm thực tế trong kho" : "Số lượng";
    $("kCostWrap").hidden = k !== "nhap";
  }
  async function saveStock() {
    const k = $("kKind").value, qty = parseInt($("kQty").value, 10), cost = $("kCost").value ? parseInt($("kCost").value, 10) : null;
    if (!(qty >= 0) || (k !== "kiem_ke" && qty === 0)) { $("kErr").textContent = "Nhập số lượng lớn hơn 0."; return; }
    if (k === "nhap" && !inv[kProduct.id] && cost === null) { $("kErr").textContent = "Lần nhập đầu tiên, hãy nhập giá vốn để tính lợi nhuận."; return; }
    const btn = $("kSave"); btn.disabled = true; btn.textContent = "Đang lưu…";
    const before = inv[kProduct.id]?.stock;
    const { data, error } = await sb.rpc("adjust_stock", { p_product_id: kProduct.id, p_kind: k, p_qty: qty, p_unit_cost: k === "nhap" ? cost : null, p_note: $("kNote").value.trim() });
    btn.disabled = false; btn.textContent = "Lưu";
    if (error) { $("kErr").textContent = `Không lưu được: ${error.message}`; return; }
    inv[kProduct.id] = data;
    const p = products.find(x => x.id === kProduct.id); const wasIn = p.in_stock; p.in_stock = data.stock > 0;
    if (wasIn !== p.in_stock || before === undefined) needRebuild(true);
    toast(`${KIND[k]}: ${kProduct.name} còn ${data.stock}`);
    renderStock(); openStock(kProduct.id);
  }
  async function saveStockMeta() {
    const row = { product_id: kProduct.id, sku: $("kSku").value.trim(), low_stock: Math.max(0, parseInt($("kLow").value, 10) || 0) };
    const { data, error } = inv[kProduct.id]
      ? await sb.from("inventory").update({ sku: row.sku, low_stock: row.low_stock }).eq("product_id", kProduct.id).select().single()
      : { data: null, error: { message: "Hãy nhập hàng lần đầu trước khi lưu thông tin kho." } };
    if (error) { $("kErr").textContent = error.message; return; }
    inv[kProduct.id] = data; renderStock(); toast("Đã lưu thông tin kho");
  }
  async function untrack() {
    const { error } = await sb.from("inventory").delete().eq("product_id", kProduct.id);
    if (error) { $("kErr").textContent = error.message; return; }
    delete inv[kProduct.id];
    await sb.from("products").update({ in_stock: true }).eq("id", kProduct.id);
    const p = products.find(x => x.id === kProduct.id); p.in_stock = true;
    needRebuild(true); renderStock(); closeStock(); toast("Đã ngừng quản lý kho, sản phẩm bán không giới hạn");
  }
  function closeStock() { $("kPanel").classList.remove("on"); $("scrim").classList.remove("on"); kProduct = null; }

  /* ================= THỐNG KÊ ================= */
  let range = "30d", lastStats = null;
  const vnDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10); // ngày theo giờ VN
  const vnStart = ymd => new Date(`${ymd}T00:00:00+07:00`);
  function rangeDates(k) {
    const today = vnDay(), t0 = vnStart(today), end = new Date(t0.getTime() + 864e5);
    const [y, m] = today.split("-").map(Number);
    if (k === "today") return [t0, end];
    if (k === "7d") return [new Date(t0 - 6 * 864e5), end];
    if (k === "30d") return [new Date(t0 - 29 * 864e5), end];
    if (k === "month") return [vnStart(`${today.slice(0, 7)}-01`), end];
    if (k === "lastmonth") { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [vnStart(`${py}-${String(pm).padStart(2, "0")}-01`), vnStart(`${today.slice(0, 7)}-01`)]; }
    return [new Date("2024-01-01T00:00:00+07:00"), end];
  }
  const RANGES = [["today", "Hôm nay"], ["7d", "7 ngày"], ["30d", "30 ngày"], ["month", "Tháng này"], ["lastmonth", "Tháng trước"], ["all", "Tất cả"]];
  const short = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace(".", ",") + " tỷ" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + "tr" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);
  async function loadStats() {
    $("rRange").innerHTML = RANGES.map(([k, l]) => `<button type="button" class="chip" data-range="${k}" aria-pressed="${range === k}">${l}</button>`).join("");
    $("statsBody").innerHTML = `<p class="loading">Đang tính…</p>`;
    const [from, to] = rangeDates(range);
    const { data, error } = await sb.rpc("admin_stats", { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error) { $("statsBody").innerHTML = `<p class="err">Không tải được thống kê: ${esc(error.message)}. Nếu báo thiếu hàm “admin_stats”, hãy chạy lại supabase/schema.sql.</p>`; return; }
    lastStats = { data, from, to }; renderStats();
  }
  function renderStats() {
    const { data: s, from, to } = lastStats;
    const profit = s.revenue_with_cost - s.cogs;
    const margin = s.revenue_with_cost ? Math.round((profit / s.revenue_with_cost) * 100) : 0;
    const aov = s.valid_orders ? Math.round(s.revenue / s.valid_orders) : 0;
    const bom = s.cod_orders ? Math.round((s.cod_bom / s.cod_orders) * 100) : 0;
    const bank = s.by_method.bank || { orders: 0, revenue: 0 }, cod = s.by_method.cod || { orders: 0, revenue: 0 };
    // biểu đồ: đủ mọi ngày trong khoảng (ngày trống = 0)
    const map = Object.fromEntries(s.daily.map(d => [d.day, d]));
    let start = from; if (range === "all" && s.daily.length) start = vnStart(s.daily[0].day);
    const days = []; for (let t = start.getTime(); t < to.getTime() && days.length < 400; t += 864e5) { const k = vnDay(new Date(t)); days.push(map[k] || { day: k, revenue: 0, orders: 0 }); }
    $("statsBody").innerHTML = `
      <div class="tiles">
        <div class="tile hero"><span>Doanh thu</span><strong>${vnd(s.revenue)}</strong><small>${s.valid_orders} đơn đã xác nhận · TB ${vnd(aov)}/đơn</small></div>
        <div class="tile"><span>Lợi nhuận gộp</span><strong>${s.revenue_with_cost ? vnd(profit) : "—"}</strong><small>${s.revenue_with_cost ? `biên ${margin}%` : "cần nhập giá vốn ở mục Kho"}${s.units_without_cost ? ` · ${s.units_without_cost} sp chưa có giá vốn` : ""}</small></div>
        <div class="tile"><span>Đang chờ xử lý</span><strong>${s.pending_orders} đơn</strong><small>${vnd(s.pending_revenue)} chưa tính vào doanh thu</small></div>
        <div class="tile ${bom >= 15 ? "bad" : bom >= 8 ? "warn" : ""}"><span>Tỷ lệ bom hàng COD</span><strong>${s.cod_orders ? bom + "%" : "—"}</strong><small>${s.cod_bom}/${s.cod_orders} đơn COD</small></div>
        <div class="tile"><span>Sản phẩm bán ra</span><strong>${s.units}</strong><small>${s.customers} khách · ${s.repeat_customers} khách mua lại</small></div>
      </div>
      <section class="panel">
        <div class="sec-row"><h3>Doanh thu theo ngày</h3><span class="p-sub">${days.length ? `${days[0].day.split("-").reverse().join("/")} – ${days[days.length - 1].day.split("-").reverse().join("/")}` : ""}</span></div>
        ${chart(days)}
        <details><summary class="p-sub" style="cursor:pointer">Xem bảng số liệu</summary>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ngày</th><th class="num">Đơn</th><th class="num">Doanh thu</th></tr></thead>
          <tbody>${days.filter(d => d.orders).reverse().map(d => `<tr><td>${d.day.split("-").reverse().join("/")}</td><td class="num">${d.orders}</td><td class="num">${vnd(d.revenue)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Chưa có đơn</td></tr>`}</tbody></table></div></details>
      </section>
      <div class="two-col">
        <section class="panel"><h3>Sản phẩm bán chạy</h3>${s.top_products.length ? `<table class="tbl"><thead><tr><th>Sản phẩm</th><th class="num">SL</th><th class="num">Doanh thu</th></tr></thead><tbody>
          ${s.top_products.map(p => `<tr><td>${esc(p.name)}<div class="bar"><i style="width:${Math.max(3, (p.qty / s.top_products[0].qty) * 100)}%"></i></div></td><td class="num">${p.qty}</td><td class="num">${vnd(p.revenue)}</td></tr>`).join("")}</tbody></table>` : `<p class="hint">Chưa có đơn đã xác nhận trong khoảng này.</p>`}</section>
        <section class="panel"><h3>Thanh toán</h3>
          <table class="tbl"><tbody>
            <tr><td>Chuyển khoản</td><td class="num">${bank.orders} đơn</td><td class="num">${vnd(bank.revenue || 0)}</td></tr>
            <tr><td>COD</td><td class="num">${cod.orders} đơn</td><td class="num">${vnd(cod.revenue || 0)}</td></tr>
          </tbody></table>
          <h3 style="margin-top:18px">Trạng thái đơn</h3>
          <table class="tbl"><tbody>${ST.filter(([k]) => s.by_status[k]).map(([k, l]) => `<tr><td><span class="st st-${k}">${l}</span></td><td class="num">${s.by_status[k]}</td></tr>`).join("") || `<tr><td class="muted">Chưa có đơn</td></tr>`}</tbody></table>
          <h3 style="margin-top:18px">Tỉnh / thành nhiều đơn</h3>
          <table class="tbl"><tbody>${s.top_cities.map(c => `<tr><td>${esc(c.city)}</td><td class="num">${c.orders} đơn</td><td class="num">${vnd(c.revenue)}</td></tr>`).join("") || `<tr><td class="muted">Chưa có đơn</td></tr>`}</tbody></table>
        </section>
      </div>
      <p class="hint">Doanh thu chỉ tính tiền hàng của đơn Đã xác nhận, Đang giao, Hoàn thành (không gồm phí ship, phí thu hộ, đơn huỷ và bom hàng). Lợi nhuận gộp = doanh thu − giá vốn, chỉ tính các sản phẩm đã có giá vốn.</p>`;
    bindChart();
  }
  function chart(days) {
    const W = 720, H = 220, L = 52, R = 8, T = 10, B = 26;
    const max = Math.max(...days.map(d => d.revenue), 0);
    if (!max) return `<p class="hint" style="padding:30px 0;text-align:center">Chưa có doanh thu trong khoảng này.</p>`;
    const step = (() => { const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= raw); })();
    const top = step * 4, y = v => T + (H - T - B) * (1 - v / top);
    const bw = (W - L - R) / days.length, gap = Math.min(2, bw * 0.25);
    const every = Math.ceil(days.length / 8);
    const ticks = [0, 1, 2, 3, 4].map(i => `<line x1="${L}" x2="${W - R}" y1="${y(step * i)}" y2="${y(step * i)}" class="grid"/><text x="${L - 8}" y="${y(step * i) + 4}" text-anchor="end" class="ax">${short(step * i)}</text>`).join("");
    const bars = days.map((d, i) => {
      const x = L + i * bw, h = Math.max(0, y(0) - y(d.revenue)), r = Math.min(4, (bw - gap) / 2, h);
      const bx = x + gap / 2, bwid = Math.max(1, bw - gap), by = y(d.revenue);
      const path = h > 0 ? `<path d="M${bx},${y(0)} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bwid - r} Q${bx + bwid},${by} ${bx + bwid},${by + r} V${y(0)} Z" class="bar-m"/>` : "";
      const label = i % every === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${d.day.slice(8)}/${d.day.slice(5, 7)}</text>` : "";
      return `<g class="hit" data-i="${i}" tabindex="0" aria-label="${d.day}: ${vnd(d.revenue)}, ${d.orders} đơn"><rect x="${x}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>${path}</g>${label}`;
    }).join("");
    return `<div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ doanh thu theo ngày">${ticks}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}</svg><div class="tip" id="tip" hidden></div></div>`;
  }
  function bindChart() {
    const c = $("chart"); if (!c) return;
    const days = (() => { const { data: s, from, to } = lastStats; const map = Object.fromEntries(s.daily.map(d => [d.day, d])); let start = from; if (range === "all" && s.daily.length) start = vnStart(s.daily[0].day); const out = []; for (let t = start.getTime(); t < to.getTime() && out.length < 400; t += 864e5) { const k = vnDay(new Date(t)); out.push(map[k] || { day: k, revenue: 0, orders: 0 }); } return out; })();
    const tip = $("tip");
    const showTip = g => {
      const d = days[+g.dataset.i]; const b = g.getBoundingClientRect(), cb = c.getBoundingClientRect();
      tip.innerHTML = `<strong>${d.day.split("-").reverse().join("/")}</strong><br>${vnd(d.revenue)} · ${d.orders} đơn`;
      tip.hidden = false;
      tip.style.left = Math.min(cb.width - tip.offsetWidth, Math.max(0, b.left - cb.left + b.width / 2 - tip.offsetWidth / 2)) + "px";
      c.querySelectorAll(".hit").forEach(x => x.classList.toggle("on", x === g));
    };
    c.querySelectorAll(".hit").forEach(g => { g.addEventListener("mouseenter", () => showTip(g)); g.addEventListener("focus", () => showTip(g)); g.addEventListener("click", () => showTip(g)); });
    c.addEventListener("mouseleave", () => { tip.hidden = true; c.querySelectorAll(".hit.on").forEach(x => x.classList.remove("on")); });
  }
  async function exportCsv() {
    const [from, to] = rangeDates(range);
    const { data, error } = await sb.from("orders").select("*").gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at").limit(5000);
    if (error) return fail(error, "Không xuất được");
    const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Mã đơn", "Thời gian", "Trạng thái", "Thanh toán", "Đã nhận tiền", "Khách", "SĐT", "Địa chỉ", "Tỉnh/thành", "Sản phẩm", "Tiền hàng", "Phí ship", "Phí thu hộ", "Tổng", "Cọc", "Hãng VC", "Mã vận đơn", "Ghi chú khách", "Ghi chú nội bộ"];
    const rows = data.map(o => [o.code, fmtTime(o.created_at), stName[o.status], o.method === "bank" ? "Chuyển khoản" : "COD", o.paid ? "Có" : "", o.buyer_name, o.phone, o.address, o.city,
      (o.items || []).map(i => `${i.qty} x ${i.name}`).join("; "), o.subtotal, o.ship, o.fee, o.total, o.deposit, o.carrier, o.tracking_code, o.note, o.admin_note]);
    const csv = "﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `don-hang-luna-${vnDay(from)}_${vnDay(new Date(to - 1))}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast(`Đã xuất ${data.length} đơn`);
  }

  /* ================= CHẶN COD ================= */
  async function loadBlocked() {
    const { data, error } = await sb.from("blocked_phones").select("*").order("created_at", { ascending: false });
    if (error) { $("bList").innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
    blockedList = data; renderBlocked();
  }
  function renderBlocked() {
    $("bCount").textContent = `${blockedList.length} số đang bị chặn COD (vẫn đặt được nếu chuyển khoản trước)`;
    $("bList").innerHTML = blockedList.map(b => `<div class="b-row"><div><span>${esc(b.phone)}</span> <span class="muted" style="font-weight:400">${esc(b.note)}</span><div class="p-sub">${fmtTime(b.created_at)}</div></div><button type="button" class="btn ghost sm" data-unblock="${esc(b.phone)}">Bỏ chặn</button></div>`).join("");
  }
  $("bForm").addEventListener("submit", async e => {
    e.preventDefault();
    const phone = normPhone($("bPhone").value);
    if (!/^0\d{9}$/.test(phone)) { $("bErr").textContent = "Số điện thoại chưa đúng (10 số, bắt đầu bằng 0)."; return; }
    const { error } = await sb.from("blocked_phones").upsert({ phone, note: $("bNote").value.trim() });
    if (error) { $("bErr").textContent = error.message; return; }
    $("bErr").textContent = ""; $("bPhone").value = ""; $("bNote").value = "";
    toast(`Đã chặn COD số ${phone}`); loadBlocked();
  });

  /* ================= CÀI ĐẶT ================= */
  async function loadSettings() {
    const { data, error } = await sb.from("shop_settings").select("*").eq("id", 1).single();
    if (error) { $("sErr").textContent = error.message; return; }
    $("sShip").value = data.ship_fee; $("sFee").value = data.cod_fee; $("sFrom").value = data.cod_deposit_from;
    $("sRate").value = Math.round(Number(data.cod_deposit_rate) * 100); $("sMax").value = data.cod_max;
    $("sPre").value = Math.round(Number(data.preorder_deposit_rate ?? 0.5) * 100);
  }
  $("sForm").addEventListener("submit", async e => {
    e.preventDefault();
    const n = id => parseInt($(id).value, 10);
    const row = { ship_fee: n("sShip"), cod_fee: n("sFee"), cod_deposit_from: n("sFrom"), cod_deposit_rate: n("sRate") / 100, cod_max: n("sMax"), preorder_deposit_rate: n("sPre") / 100, updated_at: new Date().toISOString() };
    if (Object.values(row).some(x => typeof x === "number" && !(x >= 0)) || row.cod_deposit_rate > 1 || row.preorder_deposit_rate > 1) { $("sErr").textContent = "Kiểm tra lại các số (không âm, tỷ lệ cọc 0–100%)."; return; }
    const { error } = await sb.from("shop_settings").update(row).eq("id", 1);
    if (error) { $("sErr").textContent = error.message; return; }
    $("sErr").textContent = ""; needRebuild(true); toast("Đã lưu cài đặt");
  });

  /* ================= CẬP NHẬT WEB ================= */
  $("rebuildBtn").addEventListener("click", async () => {
    const btn = $("rebuildBtn"); btn.disabled = true; btn.textContent = "Đang gửi…";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch("/api/rebuild", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      needRebuild(false); toast("Đang cập nhật web. Khoảng 1–2 phút nữa khách sẽ thấy thay đổi.");
    } catch (e) { fail(e, "Chưa cập nhật được web"); }
    btn.disabled = false; btn.textContent = "Cập nhật web";
  });

  /* ---------- sự kiện ---------- */
  document.addEventListener("click", async e => {
    const t = e.target.closest("button,[data-img-first]"); if (!t) return;
    const d = t.dataset;
    if (d.view) show(d.view);
    else if (d.of) { oFilter = d.of; renderOrders(); }
    else if (d.copy) { navigator.clipboard?.writeText(d.copy).then(() => toast(`Đã chép ${d.copy}`)).catch(() => toast(d.copy)); }
    else if (d.msg) {
      const o = orders.find(x => x.id === Number(d.msg));
      const link = `${(CFG.site || location.origin).replace(/\/$/, "")}/don-hang/?ma=${o.code}`;
      const c = (CFG.carriers || []).find(x => x.id === o.carrier);
      const shop = CFG.shopName || "Luna Cosmetics";
      const text = o.tracking_code
        ? `${shop}: Đơn ${o.code} của bạn đã được gửi${c ? ` qua ${c.name}` : ""}, mã vận đơn ${o.tracking_code}. Theo dõi đơn: ${link} (nhập số điện thoại đặt hàng).`
        : `${shop}: Cảm ơn bạn đã đặt đơn ${o.code}. Bạn theo dõi trạng thái đơn tại ${link} (nhập số điện thoại đặt hàng).`;
      navigator.clipboard?.writeText(text).then(() => toast("Đã chép tin nhắn, dán vào Zalo cho khách")).catch(() => toast(text));
    }
    else if (d.bomb) { bombing = Number(d.bomb); renderOrders(); }
    else if ("bombNo" in d) { bombing = null; renderOrders(); }
    else if (d.bombYes) {
      const o = orders.find(x => x.id === Number(d.bombYes)); bombing = null;
      const up = await updateOrder(o.id, { status: "bom_hang" });
      if (!up) return;
      const { error } = await sb.from("blocked_phones").upsert({ phone: o.phone, note: `Bom đơn ${o.code}` });
      if (error) fail(error, "Đã đánh dấu bom hàng nhưng chưa chặn được số"); else { toast(`Đã chặn COD số ${o.phone}`); loaded.blocked = false; }
    }
    else if (d.tg) toggleProduct(Number(d.pid), d.tg);
    else if (d.pst) { pF.status = d.pst; pF.page = 1; renderProducts(); }
    else if (d.pg) { pF.page = Number(d.pg); renderProducts(); $("v-products").scrollIntoView({ block: "start" }); }
    else if (t.id === "pSelAll") { pFiltered().list.forEach(p => pSel.add(p.id)); renderProducts(); }
    else if (t.id === "pSelNone") { pSel.clear(); closeBulk(); renderProducts(); }
    else if (d.bulk) { if (["show", "hide", "new", "unnew", "undisc"].includes(d.bulk)) { bulkKind = d.bulk; runBulk(d.bulk); } else openBulk(d.bulk); }
    else if (t.id === "bCancel") closeBulk();
    else if (t.id === "pCsv") exportProducts();
    else if (t.id === "csvGo") applyCsv();
    else if (t.id === "csvNo") { csvPlan = []; $("pCsvBox").innerHTML = ""; }
    else if (d.edit) openEditor(products.find(p => p.id === Number(d.edit)));
    else if (t.id === "pNew") openEditor(null);
    else if (t.id === "eAddVar") { eVars.push({ vol: "", price: $("e_price").value || "", dval: dMode === "pct" ? $("e_dval").value : "", in_stock: true, preorder: false, del: false }); renderVars(); $("eDiscAll").hidden = false; const ins = $("e_vars").querySelectorAll('[data-vf="vol"]'); ins[ins.length - 1].focus(); }
    else if (d.vdel !== undefined) { const x = eVars[Number(d.vdel)]; if (x.id) x.del = true; else eVars.splice(Number(d.vdel), 1); renderVars(); }
    else if (t.id === "eDiscAll") {
      const v0 = $("e_dval").value, pr0 = Number($("e_price").value);
      // %: dùng cùng %; số tiền: cùng số tiền; giá sau giảm: giữ cùng tỉ lệ giảm
      eVars.forEach(x => { if (x.del) return; x.dval = dMode === "price" ? (v0 && pr0 ? r1000(Number(x.price) * Number(v0) / pr0) : "") : v0; });
      renderVars(); toast(v0 ? "Đã áp dụng mức giảm cho mọi phân loại" : "Đã bỏ giảm giá ở mọi phân loại");
    }
    else if (t.id === "eClose") closeEditor();
    else if (t.id === "eDel") $("eDelConfirm").hidden = false;
    else if (t.id === "eDelNo") $("eDelConfirm").hidden = true;
    else if (t.id === "eDelYes") deleteProduct();
    else if (d.imgRm) { eImages.splice(Number(d.imgRm), 1); renderImgs(); }
    else if (d.imgFirst) { const [x] = eImages.splice(Number(d.imgFirst), 1); eImages.unshift(x); renderImgs(); }
    else if (d.unblock) {
      const { error } = await sb.from("blocked_phones").delete().eq("phone", d.unblock);
      if (error) fail(error); else { toast(`Đã bỏ chặn ${d.unblock}`); loadBlocked(); }
    }
    else if (t.id === "oReload") loadOrders();
    else if (d.kf) { kFilter = d.kf; renderStock(); }
    else if (d.kin) openStock(Number(d.kin), "nhap");
    else if (d.kopen) openStock(Number(d.kopen));
    else if (t.id === "kClose") closeStock();
    else if (t.id === "kReload") loadStock();
    else if (t.id === "kUntrack") $("kUntrackConfirm").hidden = false;
    else if (t.id === "kUntrackNo") $("kUntrackConfirm").hidden = true;
    else if (t.id === "kUntrackYes") untrack();
    else if (d.range) { range = d.range; loadStats(); }
    else if (t.id === "csvBtn") exportCsv();
  });
  document.addEventListener("change", e => {
    const t = e.target, d = t.dataset;
    if (d.status) updateOrder(Number(d.status), { status: t.value }, `Đã chuyển sang “${stName[t.value]}”`);
    else if (d.paid) {
      const o = orders.find(x => x.id === Number(d.paid));
      const patch = { paid: t.checked };
      if (t.checked && o.status === "cho_thanh_toan") patch.status = "da_xac_nhan";
      updateOrder(o.id, patch, t.checked ? "Đã ghi nhận thanh toán" : "Đã bỏ đánh dấu thanh toán");
    }
    else if (d.anote) updateOrder(Number(d.anote), { admin_note: t.value }, "Đã lưu ghi chú");
    else if (d.carrier) updateOrder(Number(d.carrier), { carrier: t.value }, "Đã lưu đơn vị vận chuyển");
    else if (d.tcode) {
      const o = orders.find(x => x.id === Number(d.tcode)), code = t.value.trim();
      const patch = { tracking_code: code };
      if (code && ["cho_xac_nhan", "da_xac_nhan"].includes(o.status)) patch.status = "dang_giao";
      updateOrder(o.id, patch, patch.status ? "Đã lưu mã vận đơn, chuyển sang “Đang giao”" : "Đã lưu mã vận đơn");
    }
    else if (t.id === "e_upload") upload(t.files);
    else if (d.psel) { const id = Number(d.psel); t.checked ? pSel.add(id) : pSel.delete(id); t.closest(".p-row").classList.toggle("picked", t.checked); renderProducts(); }
    else if (t.id === "pBrand") { pF.brand = t.value; pF.page = 1; renderProducts(); }
    else if (t.id === "pSub") { pF.sub = t.value; pF.page = 1; renderProducts(); }
    else if (t.id === "pSort") { pF.sort = t.value; pF.page = 1; renderProducts(); }
    else if (t.id === "pCsvIn") { if (t.files[0]) readCsvFile(t.files[0]); t.value = ""; }
    else if (t.id === "bMode") { $("bUnit").textContent = t.value === "pct" ? "%" : "đ"; $("bVal").placeholder = t.value === "pct" ? "Ví dụ 15" : "Ví dụ 50000"; previewBulk(); }
    else if (t.id === "bFromSale") previewBulk();
    else if (t.id === "kKind") syncKindForm();
    else if (d.vf) eVars[Number(d.vi)][d.vf] = t.type === "checkbox" ? t.checked : t.value;
    else if (t.id === "e_dmode") {
      const old = dMode, nw = t.value, pr = Number($("e_price").value);
      const conv = (price, val) => { const sl = saleFrom(price, old, val); return sl && !saleErr(price, old, val) ? valFrom(Number(price), sl, nw) : val === "" ? "" : ""; };
      $("e_dval").value = conv(pr, $("e_dval").value);
      eVars.forEach(x => { x.dval = conv(x.price, x.dval); });
      dMode = nw; try { localStorage.setItem("luna-admin-dmode", nw); } catch (e) {}
      $("e_dunit").textContent = dUnit(nw); $("e_dval").placeholder = nw === "pct" ? "Ví dụ 15" : "Ví dụ 50000";
      renderVars(); syncDisc();
    }
  });
  document.addEventListener("input", e => { if (["e_dval", "e_price"].includes(e.target.id)) syncDisc(); if (e.target.id === "bVal") previewBulk(); });
  function syncDisc() {
    if (!$("e_dprev")) return;
    const pr = Number($("e_price").value), val = $("e_dval").value, er = pr > 0 ? saleErr(pr, dMode, val) : "";
    $("e_dprev").textContent = er ? `⚠ ${er}` : dPreview(pr, dMode, val);
    $("e_dprev").classList.toggle("bad", !!er);
  }
  $("eForm").addEventListener("submit", e => { e.preventDefault(); saveProduct(); });
  document.addEventListener("submit", e => {
    if (e.target.id === "kForm") { e.preventDefault(); saveStock(); }
    if (e.target.id === "bForm2") { e.preventDefault(); runBulk(bulkKind); }
    if (e.target.id === "kMeta") { e.preventDefault(); saveStockMeta(); }
  });
  $("kSearch").addEventListener("input", e => { kQuery = e.target.value; renderStock(); });
  $("oSearch").addEventListener("input", e => { oQuery = e.target.value; renderOrders(); });
  $("pSearch").addEventListener("input", e => { pQuery = e.target.value; pF.page = 1; renderProducts(); });
  const closePanels = () => { if (!closeImport()) return; closeEditor(); closeStock(); };
  $("scrim").addEventListener("click", closePanels);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePanels(); });

  /* ---------- khởi động ---------- */
  sb.auth.getSession().then(({ data: { session } }) => (session ? enter(session) : showLogin()));
})();
