/* Luna Admin — đơn hàng, sản phẩm, chặn COD, cài đặt */
(() => {
  const CFG = window.ADMIN || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const vnd = n => (Number(n) || 0).toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "anh";
  const normPhone = s => (s || "").replace(/[\s.\-]/g, "").replace(/^\+84/, "0");
  const fmtTime = t => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  if (!CFG.supabase || !window.supabase) { $("setup").hidden = false; return; }
  const sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);

  const ST = [["cho_thanh_toan", "Chờ thanh toán"], ["cho_xac_nhan", "Chờ xác nhận"], ["da_xac_nhan", "Đã xác nhận"], ["dang_giao", "Đang giao"], ["hoan_thanh", "Hoàn thành"], ["bom_hang", "Bom hàng"], ["da_huy", "Đã huỷ"]];
  const stName = Object.fromEntries(ST);
  const OPEN = ["cho_thanh_toan", "cho_xac_nhan", "da_xac_nhan", "dang_giao"];
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
    <ul class="o-items">${(o.items || []).map(i => `<li><span>${i.qty} × ${esc(i.name)}${i.vol ? ` (${esc(i.vol)})` : ""}</span><span>${vnd(i.price * i.qty)}</span></li>`).join("")}</ul>
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
  function renderProducts() {
    const q = norm(pQuery);
    const list = products.filter(p => !q || norm(`${p.name} ${p.brand} ${p.sub} ${(p.actives || []).join(" ")}`).includes(q));
    $("pCount").textContent = `${list.length} / ${products.length} sản phẩm · ${products.filter(p => !p.in_stock).length} hết hàng · ${products.filter(p => !p.visible).length} đang ẩn`;
    $("pList").innerHTML = list.length ? list.map(p => `<div class="p-row${p.visible ? "" : " off"}">
      <div class="p-thumb" style="background:${esc(p.tint)}">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : ""}</div>
      <div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-sub">${esc(p.brand)} · ${esc(p.sub)} · ${esc(p.vol)}</div>
        <div class="p-flags">
          <button type="button" class="tg" data-tg="visible" data-pid="${p.id}" aria-pressed="${p.visible}">${p.visible ? "Đang hiện" : "Đang ẩn"}</button>
          <button type="button" class="tg stock" data-tg="in_stock" data-pid="${p.id}" aria-pressed="${p.in_stock}">${p.in_stock ? "Còn hàng" : "Hết hàng"}</button>
          <button type="button" class="tg" data-tg="is_new" data-pid="${p.id}" aria-pressed="${p.is_new}">Mới về</button>
        </div>
      </div>
      <div class="p-right">
        <span class="price">${p.sale ? `<s class="muted">${vnd(p.price)}</s> <span class="on-sale">${vnd(p.sale)}</span>` : vnd(p.price)}</span>
        <button type="button" class="btn ghost sm" data-edit="${p.id}">Sửa</button>
      </div></div>`).join("") : `<p class="loading">${products.length ? "Không có sản phẩm khớp." : "Chưa có sản phẩm. Bấm “Thêm sản phẩm” hoặc chạy supabase/seed.sql."}</p>`;
  }
  async function toggleProduct(id, field) {
    const p = products.find(x => x.id === id);
    if (field === "in_stock") {
      const { data: tracked } = await sb.from("inventory").select("stock").eq("product_id", id).maybeSingle();
      if (tracked) { toast(`Sản phẩm này đang quản lý theo kho (còn ${tracked.stock}). Vào mục Kho để nhập hàng hoặc kiểm kê.`); return; }
    }
    const { data, error } = await sb.from("products").update({ [field]: !p[field] }).eq("id", id).select().single();
    if (error) return fail(error, "Không lưu được");
    products = products.map(x => (x.id === id ? data : x)); renderProducts(); needRebuild(true);
  }

  function openEditor(p) {
    editing = p ? p.id : null;
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
        <label class="f" for="e_vol">Dung tích<input id="e_vol" value="${esc(p.vol)}" placeholder="30ml"></label>
        <label class="f" for="e_pop">Độ bán chạy (1–10)<input id="e_pop" type="number" min="1" max="10" value="${esc(p.pop)}"></label>
        <label class="f" for="e_price">Giá gốc (đ)<input id="e_price" type="number" min="0" step="1000" value="${esc(p.price)}" required></label>
        <label class="f" for="e_sale">Giá sale (đ, để trống nếu không sale)<input id="e_sale" type="number" min="0" step="1000" value="${esc(p.sale || "")}"></label>
      </div>
      <datalist id="dl_sub">${subs.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <datalist id="dl_brand">${brands.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <div class="cks">
        <label><input type="checkbox" id="e_visible"${p.visible ? " checked" : ""}>Hiện trên web</label>
        <label><input type="checkbox" id="e_in_stock"${p.in_stock ? " checked" : ""}>Còn hàng</label>
        <label><input type="checkbox" id="e_is_new"${p.is_new ? " checked" : ""}>Hàng mới về</label>
      </div>
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
    renderImgs();
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
    const price = parseInt(v("e_price"), 10), sale = v("e_sale") ? parseInt(v("e_sale"), 10) : null;
    const err = [];
    if (v("e_name").length < 3) err.push("Nhập tên sản phẩm.");
    if (!v("e_brand")) err.push("Nhập thương hiệu.");
    if (!v("e_sub")) err.push("Nhập danh mục.");
    if (!(price > 0)) err.push("Nhập giá gốc.");
    if (sale !== null && !(sale > 0 && sale < price)) err.push("Giá sale phải nhỏ hơn giá gốc.");
    if (err.length) { $("eErr").textContent = err.join(" "); return; }
    const row = {
      name: v("e_name"), brand: v("e_brand"), origin: v("e_origin"), cat: v("e_cat"), sub: v("e_sub"), vol: v("e_vol"),
      price, sale, pop: Math.max(1, Math.min(10, parseInt(v("e_pop"), 10) || 5)),
      visible: $("e_visible").checked, in_stock: $("e_in_stock").checked, is_new: $("e_is_new").checked,
      actives: v("e_actives").split(",").map(s => s.trim()).filter(Boolean), skin: checked("skin"), concerns: checked("concerns"),
      images: eImages, descr: v("e_descr"), howto: v("e_howto"), ingredients: v("e_ingredients"), tint: $("e_tint").value, shape: v("e_shape"),
    };
    const btn = $("eSave"); btn.disabled = true; btn.textContent = "Đang lưu…";
    const res = editing ? await sb.from("products").update(row).eq("id", editing).select().single() : await sb.from("products").insert(row).select().single();
    btn.disabled = false; btn.textContent = "Lưu sản phẩm";
    if (res.error) { $("eErr").textContent = `Không lưu được: ${res.error.message}`; return; }
    products = editing ? products.map(p => (p.id === editing ? res.data : p)) : [...products, res.data];
    renderProducts(); closeEditor(); needRebuild(true); toast("Đã lưu sản phẩm");
  }
  async function deleteProduct() {
    const { error } = await sb.from("products").delete().eq("id", editing);
    if (error) { $("eErr").textContent = `Không xoá được: ${error.message}`; return; }
    products = products.filter(p => p.id !== editing); renderProducts(); closeEditor(); needRebuild(true); toast("Đã xoá sản phẩm");
  }
  function closeEditor() { $("editor").classList.remove("on"); $("scrim").classList.remove("on"); editing = null; }

  /* ================= KHO ================= */
  let inv = {}, sold30 = {}, kFilter = "all", kQuery = "", kProduct = null;
  const KIND = { nhap: "Nhập hàng", ban: "Bán", huy_don: "Hoàn kho (huỷ đơn)", tra: "Khách trả hàng", hong: "Hàng hỏng / hết hạn", kiem_ke: "Kiểm kê" };
  const stockState = p => {
    const r = inv[p.id];
    if (!r) return { key: "untracked", label: "Chưa quản lý kho", cls: "" };
    if (r.stock <= 0) return { key: "out", label: r.stock < 0 ? `Âm ${-r.stock}` : "Hết hàng", cls: "bad" };
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
    const low = products.filter(p => stockState(p).key === "low"), out = products.filter(p => stockState(p).key === "out");
    $("lowCount").textContent = low.length + out.length; $("lowCount").hidden = !(low.length + out.length);
    $("kTiles").innerHTML = [
      ["Đang quản lý kho", `${tracked.length}<small>/${products.length} sản phẩm</small>`],
      ["Tổng tồn", `${units.toLocaleString("vi-VN")}<small> sản phẩm</small>`],
      ["Giá trị tồn (giá vốn)", vnd(value)],
      ["Sắp hết", `${low.length}`, low.length ? "warn" : ""],
      ["Hết hàng", `${out.length}`, out.length ? "bad" : ""],
    ].map(([l, v, c]) => `<div class="tile ${c || ""}"><span>${l}</span><strong>${v}</strong></div>`).join("");
    const counts = { all: products.length, low: low.length, out: out.length, untracked: products.length - tracked.length };
    $("kFilter").innerHTML = [["all", "Tất cả"], ["low", "Sắp hết"], ["out", "Hết hàng"], ["untracked", "Chưa quản lý kho"]]
      .map(([k, l]) => `<button type="button" class="chip" data-kf="${k}" aria-pressed="${kFilter === k}">${l}<b>${counts[k]}</b></button>`).join("");
    const q = norm(kQuery);
    const order = { out: 0, low: 1, ok: 2, untracked: 3 };
    const list = products.filter(p => (kFilter === "all" || stockState(p).key === kFilter) && (!q || norm(`${p.name} ${p.brand} ${inv[p.id]?.sku || ""}`).includes(q)))
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
  }
  $("sForm").addEventListener("submit", async e => {
    e.preventDefault();
    const n = id => parseInt($(id).value, 10);
    const row = { ship_fee: n("sShip"), cod_fee: n("sFee"), cod_deposit_from: n("sFrom"), cod_deposit_rate: n("sRate") / 100, cod_max: n("sMax"), updated_at: new Date().toISOString() };
    if (Object.values(row).some(x => typeof x === "number" && !(x >= 0)) || row.cod_deposit_rate > 1) { $("sErr").textContent = "Kiểm tra lại các số (không âm, tỷ lệ cọc 0–100%)."; return; }
    const { error } = await sb.from("shop_settings").update(row).eq("id", 1);
    if (error) { $("sErr").textContent = error.message; return; }
    $("sErr").textContent = ""; needRebuild(true); toast("Đã lưu cài đặt");
  });

  /* ================= CẬP NHẬT WEB ================= */
  $("rebuildBtn").addEventListener("click", async () => {
    const btn = $("rebuildBtn"); btn.disabled = true; btn.textContent = "Đang gửi…";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch("/.netlify/functions/rebuild", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
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
    else if (d.edit) openEditor(products.find(p => p.id === Number(d.edit)));
    else if (t.id === "pNew") openEditor(null);
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
    else if (t.id === "kKind") syncKindForm();
  });
  $("eForm").addEventListener("submit", e => { e.preventDefault(); saveProduct(); });
  document.addEventListener("submit", e => {
    if (e.target.id === "kForm") { e.preventDefault(); saveStock(); }
    if (e.target.id === "kMeta") { e.preventDefault(); saveStockMeta(); }
  });
  $("kSearch").addEventListener("input", e => { kQuery = e.target.value; renderStock(); });
  $("oSearch").addEventListener("input", e => { oQuery = e.target.value; renderOrders(); });
  $("pSearch").addEventListener("input", e => { pQuery = e.target.value; renderProducts(); });
  $("scrim").addEventListener("click", () => { closeEditor(); closeStock(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeEditor(); closeStock(); } });

  /* ---------- khởi động ---------- */
  sb.auth.getSession().then(({ data: { session } }) => (session ? enter(session) : showLogin()));
})();
