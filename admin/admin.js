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
    ["orders", "products", "blocked", "settings"].forEach(v => ($(`v-${v}`).hidden = v !== view));
    if (!loaded[view]) { loaded[view] = true; ({ orders: loadOrders, products: loadProducts, blocked: loadBlocked, settings: loadSettings })[view](); }
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
    else if (t.id === "e_upload") upload(t.files);
  });
  $("eForm").addEventListener("submit", e => { e.preventDefault(); saveProduct(); });
  $("oSearch").addEventListener("input", e => { oQuery = e.target.value; renderOrders(); });
  $("pSearch").addEventListener("input", e => { pQuery = e.target.value; renderProducts(); });
  $("scrim").addEventListener("click", closeEditor);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeEditor(); });

  /* ---------- khởi động ---------- */
  sb.auth.getSession().then(({ data: { session } }) => (session ? enter(session) : showLogin()));
})();
