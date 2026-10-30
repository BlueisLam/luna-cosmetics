/* Luna Cosmetics — giỏ hàng, bộ lọc cửa hàng, thanh toán */
(() => {
  const { products: P, cfg: CFG, needs: NEEDS, art: ACCENT } = window.LUNA;
  const $ = id => document.getElementById(id);
  const byId = id => P.find(p => p.id == id);
  const priceOf = p => p.sale || p.price;
  const vnd = n => n.toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const normPhone = s => (s || "").replace(/[\s.\-]/g, "").replace(/^\+84/, "0");
  const SB = CFG.supabase;
  const rpc = async (fn, body) => {
    const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SB.anonKey, ...(SB.anonKey.startsWith("eyJ") ? { Authorization: `Bearer ${SB.anonKey}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && data.message) || `HTTP ${r.status}`);
    return data;
  };
  const rest = async path => {
    const r = await fetch(`${SB.url}/rest/v1/${path}`, { headers: { apikey: SB.anonKey, ...(SB.anonKey.startsWith("eyJ") ? { Authorization: `Bearer ${SB.anonKey}` } : {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const MAX_QTY = 20;
  // Số bị chặn COD được kiểm tra trên server, danh sách không lộ ra web
  const blocked = {};
  const isBlocked = s => blocked[normPhone(s)] === true;
  async function checkPhone(phone) {
    const p = normPhone(phone);
    if (!SB || !/^0(3|5|7|8|9)\d{8}$/.test(p) || p in blocked) return;
    try { blocked[p] = !(await rpc("cod_allowed", { p_phone: p })); } catch (e) { return; }
    if (blocked[p] && checkoutEl && !lastOrder) { readForm(); if (form.method === "cod") form.method = "bank"; renderCheckout(); }
  }

  function thumb(p) {
    if (p.img) return `<img src="${esc(p.img)}" alt="">`;
    const a = ACCENT[p.shape] || "#c9a395";
    return `<svg viewBox="0 0 100 120" aria-hidden="true"><rect x="30" y="38" width="40" height="72" rx="10" fill="#fffaf6"/><rect x="40" y="20" width="20" height="20" rx="4" fill="${a}"/></svg>`;
  }

  /* ---------- giỏ hàng ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let cart = store.get("luna-cart", {});
  Object.keys(cart).forEach(id => { if (!byId(id) || cart[id] <= 0) delete cart[id]; });
  const save = () => { store.set("luna-cart", cart); renderBag(); if (checkoutEl) renderCheckout(); };
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + priceOf(byId(id)) * q, 0);
  const add = (id, q = 1) => {
    const p = byId(id);
    if (!p || p.inStock === false) return false;
    cart[id] = Math.min(MAX_QTY, (cart[id] || 0) + q); save();
    return true;
  };

  function renderBag() {
    $("bagCount").textContent = count();
    const items = Object.entries(cart);
    $("dBody").innerHTML = items.length ? items.map(([id, q]) => {
      const p = byId(id);
      return `<div class="line">
        <div class="thumb" style="background:${p.tint}">${thumb(p)}</div>
        <div><h4><a href="${p.url}">${esc(p.name)}</a></h4>
          <div class="qty"><button type="button" data-q="${id}" data-d="-1" aria-label="Giảm">−</button><span>${q}</span><button type="button" data-q="${id}" data-d="1" aria-label="Tăng">+</button></div></div>
        <span class="price">${vnd(priceOf(p) * q)}</span></div>`;
    }).join("") : `<div class="empty">Giỏ hàng đang trống.<br>Chọn vài món skincare yêu thích nhé.</div>`;
    $("dFoot").innerHTML = `
      <div class="row"><span>Tạm tính</span><span>${vnd(subtotal())}</span></div>
      ${items.length ? `<div class="row save"><span>Chuyển khoản trước: miễn phí giao hàng</span><span>−${vnd(CFG.shipFee)}</span></div>` : ""}
      ${items.length ? `<a class="btn" href="/thanh-toan/">Đặt hàng</a>` : `<a class="btn ghost" href="/cua-hang/">Xem sản phẩm</a>`}`;
  }
  const openBag = () => { renderBag(); $("drawer").classList.add("on"); $("scrim").classList.add("on"); };
  const closeAll = () => { ["drawer", "scrim", "filters"].forEach(id => $(id) && $(id).classList.remove("on")); };

  /* ---------- trang sản phẩm ---------- */
  let pq = 1;

  /* ---------- cửa hàng: bộ lọc ---------- */
  const shopEl = $("shop");
  const GROUPS = [
    { key: "concerns", label: "Nhu cầu", param: "need" },
    { key: "brand", label: "Thương hiệu", param: "brand" },
    { key: "actives", label: "Hoạt chất", param: "active" },
    { key: "skin", label: "Loại da", param: "skin" },
    { key: "price", label: "Khoảng giá", param: "price" },
  ];
  const PRICES = [
    { k: "duoi-500k", l: "Dưới 500.000đ", t: p => p < 500000 },
    { k: "500k-1tr", l: "500.000đ – 1 triệu", t: p => p >= 500000 && p < 1000000 },
    { k: "1tr-1.5tr", l: "1 – 1,5 triệu", t: p => p >= 1000000 && p < 1500000 },
    { k: "tren-1.5tr", l: "Trên 1,5 triệu", t: p => p >= 1500000 },
  ];
  const FLAGS = { all: () => true, new: p => p.isNew, sale: p => !!p.sale, best: p => p.pop >= 9 };
  const S = { tab: "all", sub: "Tất cả", sort: "pop", flag: "all", q: "", sel: {}, open: new Set(GROUPS.map(g => g.key)) };
  GROUPS.forEach(g => (S.sel[g.key] = new Set()));
  const valsOf = (p, k) => k === "brand" ? [p.brand] : k === "price" ? PRICES.filter(r => r.t(priceOf(p))).map(r => r.k) : p[k] || [];
  const inTab = p => S.tab === "all" || p.cat === S.tab;
  function base(p) {
    if (!inTab(p)) return false;
    if (S.sub !== "Tất cả" && p.sub !== S.sub) return false;
    if (!FLAGS[S.flag](p)) return false;
    if (S.q) {
      const hay = norm([p.name, p.brand, p.sub, p.origin, ...p.actives, ...p.concerns, ...p.skin].join(" "));
      if (!norm(S.q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
    }
    return true;
  }
  const facets = (p, skip) => GROUPS.every(g => g.key === skip || !S.sel[g.key].size || valsOf(p, g.key).some(v => S.sel[g.key].has(v)));

  function readURL() {
    const u = new URLSearchParams(location.search);
    S.q = u.get("q") || "";
    S.flag = FLAGS[u.get("flag")] ? u.get("flag") : "all";
    S.tab = ["skincare", "makeup"].includes(u.get("tab")) ? u.get("tab") : "all";
    S.sort = u.get("sort") || "pop";
    GROUPS.forEach(g => u.getAll(g.param).forEach(v => S.sel[g.key].add(v)));
    if ($("q")) $("q").value = S.q;
    if ($("sort")) $("sort").value = S.sort;
  }
  function writeURL() {
    const u = new URLSearchParams();
    if (S.q) u.set("q", S.q);
    if (S.tab !== "all") u.set("tab", S.tab);
    if (S.flag !== "all") u.set("flag", S.flag);
    if (S.sort !== "pop") u.set("sort", S.sort);
    GROUPS.forEach(g => S.sel[g.key].forEach(v => u.append(g.param, v)));
    const qs = u.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) {}
  }

  function renderShop() {
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === S.tab));
    const tabList = P.filter(inTab);
    // mục nhanh
    const fl = [["all", "Tất cả"], ["new", "Hàng mới về"], ["sale", "Đang sale"], ["best", "Bán chạy"]];
    $("flags").innerHTML = fl.map(([k, l]) => `<button type="button" class="flag${k === "sale" ? " sale" : ""}" data-flag="${k}" aria-pressed="${S.flag === k}">${l}${k === "all" ? "" : ` (${tabList.filter(FLAGS[k]).length})`}</button>`).join("");
    // danh mục con
    const subs = ["Tất cả", ...new Set(tabList.map(p => p.sub))];
    if (!subs.includes(S.sub)) S.sub = "Tất cả";
    $("chips").innerHTML = subs.map(s => `<button type="button" class="chip" data-sub="${esc(s)}" aria-pressed="${s === S.sub}">${esc(s)}</button>`).join("");
    // nhóm lọc
    $("fgroups").innerHTML = GROUPS.map(g => {
      let vals = g.key === "price" ? PRICES.map(r => r.k) : g.key === "concerns" ? NEEDS.map(n => n.name) : [...new Set(tabList.flatMap(p => valsOf(p, g.key)))].sort((a, b) => a.localeCompare(b, "vi"));
      vals = vals.filter(v => tabList.some(p => valsOf(p, g.key).includes(v)) || S.sel[g.key].has(v));
      if (!vals.length) return "";
      const rows = vals.map(v => {
        const n = P.filter(p => base(p) && facets(p, g.key) && valsOf(p, g.key).includes(v)).length;
        const on = S.sel[g.key].has(v);
        const label = g.key === "price" ? PRICES.find(r => r.k === v).l : v;
        return `<label class="ck${n || on ? "" : " zero"}"><input type="checkbox" data-f="${g.key}" value="${esc(v)}"${on ? " checked" : ""}>${esc(label)}<em>${n}</em></label>`;
      }).join("");
      return `<details class="fgroup" data-g="${g.key}"${S.open.has(g.key) ? " open" : ""}><summary>${g.label}${S.sel[g.key].size ? ` · ${S.sel[g.key].size}` : ""}</summary><div class="opts">${rows}</div></details>`;
    }).join("");
    const nSel = GROUPS.reduce((n, g) => n + S.sel[g.key].size, 0);
    $("fCount").textContent = nSel ? `(${nSel})` : "";
    // bộ lọc đang chọn
    const pills = [];
    if (S.q) pills.push(`<button type="button" class="pill" data-rm="q|">Tìm: “${esc(S.q)}”</button>`);
    GROUPS.forEach(g => S.sel[g.key].forEach(v => pills.push(`<button type="button" class="pill" data-rm="${g.key}|${esc(v)}">${esc(g.key === "price" ? PRICES.find(r => r.k === v)?.l || v : v)}</button>`)));
    $("active").innerHTML = pills.length ? pills.join("") + `<button type="button" class="linkish" data-clear>Xoá tất cả</button>` : "";
    // lưới sản phẩm: ẩn/hiện và sắp xếp các thẻ có sẵn
    const list = P.filter(p => base(p) && facets(p));
    const pct = p => (p.sale ? 1 - p.sale / p.price : 0);
    list.sort((a, b) => S.sort === "asc" ? priceOf(a) - priceOf(b) : S.sort === "desc" ? priceOf(b) - priceOf(a) : S.sort === "discount" ? pct(b) - pct(a) : S.sort === "new" ? (!!b.isNew - !!a.isNew) || b.id - a.id : b.pop - a.pop);
    const gridEl = $("grid"), show = new Set(list.map(p => String(p.id)));
    const cards = [...gridEl.querySelectorAll(".card")];
    cards.forEach(c => (c.hidden = !show.has(c.dataset.id)));
    list.forEach(p => { const c = gridEl.querySelector(`.card[data-id="${p.id}"]`); if (c) gridEl.appendChild(c); });
    let none = gridEl.querySelector(".nores");
    if (!list.length && !none) { none = document.createElement("div"); none.className = "nores"; none.innerHTML = `Chưa có sản phẩm khớp bộ lọc.<br><button type="button" class="linkish" data-clear>Xoá bộ lọc</button>`; gridEl.appendChild(none); }
    if (none) none.hidden = !!list.length;
    $("result").textContent = `${list.length} sản phẩm`;
    writeURL();
  }
  function clearShop() { GROUPS.forEach(g => S.sel[g.key].clear()); S.q = ""; if ($("q")) $("q").value = ""; S.flag = "all"; S.sub = "Tất cả"; renderShop(); }

  /* ---------- thanh toán ---------- */
  const checkoutEl = $("checkout");
  let form = store.get("luna-buyer", { name: "", phone: "", addr: "", city: "TP. Hồ Chí Minh", note: "" });
  form.method = "bank";
  let lastOrder = null;
  const CITIES = ["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng", "Huế", "Cà Mau", "Đồng Nai", "Tây Ninh", "Vĩnh Long", "Đồng Tháp", "An Giang", "Khánh Hoà", "Lâm Đồng", "Đắk Lắk", "Gia Lai", "Quảng Ngãi", "Quảng Trị", "Nghệ An", "Hà Tĩnh", "Thanh Hoá", "Ninh Bình", "Hưng Yên", "Bắc Ninh", "Phú Thọ", "Thái Nguyên", "Tuyên Quang", "Lào Cai", "Lạng Sơn", "Cao Bằng", "Điện Biên", "Lai Châu", "Sơn La", "Quảng Ninh"];
  let cartNotice = "";

  function quote(method) {
    const st = subtotal();
    if (method === "bank") return { ship: 0, fee: 0, total: st, deposit: st };
    const total = st + CFG.shipFee + CFG.codFee;
    const deposit = st >= CFG.codDepositFrom ? Math.round((total * CFG.codDepositRate) / 1000) * 1000 : 0;
    return { ship: CFG.shipFee, fee: CFG.codFee, total, deposit };
  }
  function readForm() {
    const g = id => ($(id) ? $(id).value.trim() : form[id.slice(1).toLowerCase()] || "");
    if (!$("fName")) return;
    form.name = g("fName"); form.phone = normPhone(g("fPhone")); form.addr = g("fAddr"); form.city = g("fCity"); form.note = g("fNote");
    store.set("luna-buyer", { name: form.name, phone: form.phone, addr: form.addr, city: form.city, note: "" });
  }
  function renderCheckout() {
    if (lastOrder) return renderDone();
    if ($("fName")) readForm(); // giữ nguyên những gì khách đang gõ
    const items = Object.entries(cart);
    if (!items.length) {
      const recent = SB ? myOrders()[0] : null;
      checkoutEl.innerHTML = `<div class="done-box"><h1 class="display">Giỏ hàng đang trống</h1>
        ${cartNotice ? `<p class="note">${esc(cartNotice)}</p>` : ""}
        <p class="lead" style="margin:0 auto">Chọn sản phẩm trước rồi quay lại thanh toán nhé.</p>
        <p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn" href="/cua-hang/">Xem sản phẩm</a>${recent ? `<a class="btn ghost" href="/don-hang/?ma=${encodeURIComponent(recent.code)}">Xem đơn vừa đặt (${esc(recent.code)})</a>` : ""}</p></div>`;
      return;
    }
    const st = subtotal(), phoneBlocked = isBlocked(form.phone), overMax = st > CFG.codMax;
    const codBlocked = overMax || phoneBlocked, depositNeeded = st >= CFG.codDepositFrom;
    if (codBlocked && form.method === "cod") form.method = "bank";
    const qb = quote("bank"), qc = quote("cod"), q = quote(form.method);
    const blockMsg = phoneBlocked ? "Số điện thoại này chưa áp dụng COD, vui lòng chuyển khoản." : `Đơn trên ${vnd(CFG.codMax)} chỉ nhận chuyển khoản.`;
    checkoutEl.innerHTML = `
    <div class="page-head"><h1 class="display">Thanh toán</h1></div>
    <div class="checkout">
      <form id="ckForm" class="panel" novalidate>
        ${cartNotice ? `<p class="note">${esc(cartNotice)}</p>` : ""}
        <fieldset><legend>Thông tin nhận hàng</legend>
          <label class="f" for="fName">Họ tên<input id="fName" value="${esc(form.name)}" autocomplete="name" placeholder="Nguyễn Thị Lan" required></label>
          <div class="two">
            <label class="f" for="fPhone">Số điện thoại<input id="fPhone" value="${esc(form.phone)}" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" required></label>
            <label class="f" for="fCity">Tỉnh / thành phố<input id="fCity" value="${esc(form.city)}" list="cityList" autocomplete="address-level1" placeholder="Gõ hoặc chọn" required></label>
            <datalist id="cityList">${CITIES.map(c => `<option value="${c}">`).join("")}</datalist>
          </div>
          <label class="f" for="fAddr">Địa chỉ<input id="fAddr" value="${esc(form.addr)}" autocomplete="street-address" placeholder="Số nhà, đường, phường/xã" required></label>
          <label class="f" for="fNote">Ghi chú (không bắt buộc)<input id="fNote" value="${esc(form.note)}" placeholder="Giao giờ hành chính…"></label>
        </fieldset>
        <fieldset><legend>Hình thức thanh toán</legend>
          <div class="pay">
            <label class="opt"><input type="radio" name="pm" value="bank"${form.method === "bank" ? " checked" : ""}>
              <span><b>Chuyển khoản ngân hàng <span class="badge">Miễn phí giao hàng</span></b>
              <small>Quét mã QR sau khi đặt. Đơn được đóng gói ngay khi nhận tiền, kèm quà mẫu thử.</small>
              <small><strong>Thanh toán: ${vnd(qb.total)}</strong></small></span></label>
            <label class="opt${codBlocked ? " off" : ""}"><input type="radio" name="pm" value="cod"${form.method === "cod" ? " checked" : ""}${codBlocked ? " disabled" : ""}>
              <span><b>Nhận hàng trả tiền (COD)${depositNeeded && !codBlocked ? ` <span class="badge w">Cần cọc ${Math.round(CFG.codDepositRate * 100)}%</span>` : ""}</b>
              <small>${codBlocked ? blockMsg : `Ship ${vnd(CFG.shipFee)} + phí thu hộ ${vnd(CFG.codFee)}. Shop gọi hoặc nhắn Zalo xác nhận trước khi gửi hàng.`}</small>
              ${codBlocked ? "" : `<small><strong>Tổng: ${vnd(qc.total)}</strong>${qc.deposit ? ` · cọc trước ${vnd(qc.deposit)}, còn lại trả khi nhận` : ""}</small>`}</span></label>
          </div>
          ${form.method === "cod" && !codBlocked ? `<div class="note">Chọn chuyển khoản để tiết kiệm <strong>${vnd(qc.total - qb.total)}</strong>${qc.deposit ? " và không cần cọc" : ""}.</div>` : ""}
        </fieldset>
        <p class="err" id="fErr" role="alert"></p>
        <button class="btn" type="submit">${form.method === "bank" ? "Đặt hàng & chuyển khoản" : q.deposit ? `Đặt hàng & cọc ${vnd(q.deposit)}` : "Đặt hàng COD"}</button>
      </form>
      <aside class="panel summary" aria-label="Tóm tắt đơn hàng">
        <p class="eyebrow" style="margin:0">Đơn hàng (${count()} sản phẩm)</p>
        ${items.map(([id, n]) => { const p = byId(id); return `<div class="line"><div class="thumb" style="background:${p.tint}">${thumb(p)}</div><div><h4>${esc(p.name)}</h4><small>${esc(p.brand)} · x${n}</small></div><span class="price">${vnd(priceOf(p) * n)}</span></div>`; }).join("")}
        <div class="row"><span>Tạm tính</span><span>${vnd(st)}</span></div>
        <div class="row"><span>Phí giao hàng</span><span>${q.ship ? vnd(q.ship) : "Miễn phí"}</span></div>
        ${q.fee ? `<div class="row"><span>Phí thu hộ</span><span>${vnd(q.fee)}</span></div>` : ""}
        <div class="row total"><span>Tổng cộng</span><span>${vnd(q.total)}</span></div>
        <button type="button" class="linkish" id="editCart">Sửa giỏ hàng</button>
      </aside>
    </div>`;
  }
  let sending = false;
  const ERR = {
    COD_BLOCKED: "Số điện thoại này chưa áp dụng COD, vui lòng chọn chuyển khoản.",
    COD_OVER_MAX: `Đơn trên ${vnd(CFG.codMax)} chỉ nhận chuyển khoản.`,
    BAD_PHONE: "Số điện thoại chưa đúng (ví dụ 0912345678).",
    BAD_NAME: "Vui lòng nhập họ tên.", BAD_ADDRESS: "Vui lòng nhập địa chỉ đầy đủ.",
    EMPTY_CART: "Giỏ hàng đang trống.", BAD_QTY: "Mỗi sản phẩm đặt tối đa 20 cái. Cần nhiều hơn vui lòng nhắn Zalo shop.",
    TOO_MANY: "Bạn vừa đặt nhiều đơn liên tiếp. Vui lòng đợi vài phút hoặc nhắn Zalo shop.",
    BUSY: `Hệ thống đang nhận quá nhiều đơn, vui lòng thử lại sau ít phút hoặc nhắn Zalo ${CFG.zalo}.`,
  };
  async function placeOrder() {
    if (sending) return;
    readForm();
    const err = [];
    if (form.name.length < 2) err.push("Vui lòng nhập họ tên.");
    if (!/^0(3|5|7|8|9)\d{8}$/.test(form.phone)) err.push("Số điện thoại chưa đúng (ví dụ 0912345678).");
    if (form.addr.length < 6) err.push("Vui lòng nhập địa chỉ đầy đủ.");
    if (form.city.length < 2) err.push("Vui lòng nhập tỉnh/thành phố.");
    if (form.method === "cod" && (isBlocked(form.phone) || subtotal() > CFG.codMax)) { form.method = "bank"; renderCheckout(); $("fErr").textContent = "Đơn này chỉ nhận chuyển khoản, đã chuyển sang hình thức chuyển khoản."; return; }
    if (err.length) { $("fErr").textContent = err.join(" "); return; }
    const items = Object.entries(cart).map(([id, n]) => ({ id: +id, qty: n }));
    const buyer = { name: form.name, phone: form.phone, addr: form.addr, city: form.city, note: form.note };
    if (SB) {
      const btn = document.querySelector("#ckForm button[type=submit]");
      sending = true; btn.disabled = true; btn.textContent = "Đang gửi đơn…"; $("fErr").textContent = "";
      try {
        const r = await rpc("place_order", { p_items: items, p_method: form.method, p_name: form.name, p_phone: form.phone, p_address: form.addr, p_city: form.city, p_note: form.note });
        lastOrder = { ...r, buyer, at: new Date().toISOString() };
        remember(r.code, form.phone);
      } catch (e) {
        sending = false;
        const m = e.message || "";
        if (m === "COD_BLOCKED") blocked[normPhone(form.phone)] = true;
        if (m === "COD_BLOCKED" || m === "COD_OVER_MAX") form.method = "bank";
        if (m.startsWith("OUT_OF_STOCK") || m.startsWith("PRODUCT_NOT_FOUND")) await syncCart();
        renderCheckout();
        $("fErr").textContent = m.startsWith("OUT_OF_STOCK:") ? `“${m.slice(13)}” vừa hết hàng, vui lòng bỏ khỏi giỏ.`
          : m.startsWith("PRODUCT_NOT_FOUND") ? "Có sản phẩm trong giỏ không còn bán, vui lòng tải lại trang."
          : ERR[m] || `Chưa gửi được đơn. Kiểm tra mạng rồi thử lại, hoặc nhắn Zalo ${CFG.zalo}.`;
        return;
      }
      sending = false;
    } else {
    const q = quote(form.method);
    lastOrder = { code: "LUNA" + Date.now().toString().slice(-6), at: new Date().toISOString(), method: form.method, ...q,
      items: Object.entries(cart).map(([id, n]) => ({ id: +id, name: byId(id).name, qty: n, price: priceOf(byId(id)) })),
      buyer: { name: form.name, phone: form.phone, addr: form.addr, city: form.city, note: form.note } };
    // Chưa nối Supabase: chế độ chạy thử, đơn chỉ lưu trên máy này
    const orders = store.get("luna-orders", []); orders.push(lastOrder); store.set("luna-orders", orders);
    }
    cart = {}; store.set("luna-cart", cart); renderBag();
    renderDone(); window.scrollTo(0, 0);
  }
  function renderDone() {
    const o = lastOrder, pay = o.method === "bank" ? o.total : o.deposit, b = CFG.bank;
    const qr = `https://img.vietqr.io/image/${b.bin}-${b.acc}-compact2.png?amount=${pay}&addInfo=${encodeURIComponent(o.code)}${b.holder ? `&accountName=${encodeURIComponent(b.holder)}` : ""}`;
    checkoutEl.innerHTML = `<div class="done-box">
      <h1 class="display">Cảm ơn ${esc(o.buyer.name.split(" ").pop())}!</h1>
      <p>Mã đơn <strong>${o.code}</strong></p>
      ${pay ? `<p class="lead" style="margin:0 auto">${o.method === "bank" ? "Quét mã để chuyển khoản, Luna đóng gói đơn ngay khi nhận tiền:" : "Chuyển khoản tiền cọc để xác nhận đơn COD:"}</p>
      <img class="qr" src="${qr}" alt="Mã QR chuyển khoản ${vnd(pay)}" width="220" height="220">
      <div class="bank">
        <div class="row"><span>Ngân hàng</span><span>${esc(b.name)}</span></div>
        <div class="row"><span>Số tài khoản</span><span>${esc(b.acc)}<button type="button" class="copy" data-copy="${esc(b.acc)}">Chép</button></span></div>
        ${b.holder ? `<div class="row"><span>Chủ tài khoản</span><span>${esc(b.holder)}</span></div>` : ""}
        <div class="row"><span>Số tiền</span><span>${vnd(pay)}</span></div>
        <div class="row"><span>Nội dung</span><span>${o.code}<button type="button" class="copy" data-copy="${o.code}">Chép</button></span></div>
      </div>
      <p class="lead" style="margin:0 auto">${o.method === "cod" ? `Còn lại ${vnd(o.total - o.deposit)} trả khi nhận hàng.` : "Giao 1–3 ngày, miễn phí giao hàng."}</p>`
      : `<p class="lead" style="margin:0 auto">Bạn trả ${vnd(o.total)} khi nhận hàng.</p>`}
      ${o.method === "cod" ? `<div class="note" style="text-align:left"><strong>Đơn COD chỉ được gửi sau khi xác nhận.</strong> Luna sẽ gọi hoặc nhắn Zalo cho bạn trong giờ làm việc. Bạn cũng có thể nhắn Zalo <strong>${esc(CFG.zalo)}</strong><button type="button" class="copy" data-copy="${esc(CFG.zalo.replace(/\s/g, ""))}">Chép</button> kèm mã đơn <strong>${o.code}</strong> để được gửi sớm hơn.</div>` : ""}
      <p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${SB ? `<a class="btn" href="/don-hang/?ma=${encodeURIComponent(o.code)}">Theo dõi đơn hàng</a>` : ""}<a class="btn ghost" href="/cua-hang/">Tiếp tục mua sắm</a></p>
      ${SB ? `<p class="lead" style="margin:0 auto;font-size:13px">Lưu lại mã đơn <strong>${o.code}</strong> để tra cứu sau tại mục “Tra cứu đơn”.</p>` : ""}
    </div>`;
  }

  // Lấy giá, tồn kho và phí mới nhất từ server để khách thấy đúng số sẽ bị tính
  async function syncCart() {
    const ids = Object.keys(cart).filter(id => /^\d+$/.test(id));
    if (!SB || !ids.length) return;
    try {
      const [rows, st] = await Promise.all([rest(`products?id=in.(${ids.join(",")})&select=id,name,price,sale,in_stock`), rest("shop_settings?id=eq.1&select=*")]);
      const s = st && st[0];
      if (s) Object.assign(CFG, { shipFee: s.ship_fee, codFee: s.cod_fee, codDepositFrom: s.cod_deposit_from, codDepositRate: Number(s.cod_deposit_rate), codMax: s.cod_max });
      const gone = [], changed = [];
      ids.forEach(id => {
        const p = byId(id), r = rows.find(x => String(x.id) === id);
        if (!r || !r.in_stock) { gone.push(p.name); delete cart[id]; p.inStock = false; return; }
        const before = priceOf(p);
        p.price = r.price; p.sale = r.sale || 0;
        if (priceOf(p) !== before) changed.push(p.name);
      });
      cartNotice = [gone.length ? `${gone.join(", ")} vừa hết hàng nên đã được bỏ khỏi giỏ.` : "", changed.length ? `Giá của ${changed.join(", ")} vừa được cập nhật.` : ""].filter(Boolean).join(" ");
      if (gone.length) store.set("luna-cart", cart);
      renderBag();
    } catch (e) { /* mạng lỗi: vẫn cho đặt, server sẽ tính lại đúng */ }
  }

  /* ---------- tra cứu đơn hàng ---------- */
  const trackEl = $("track");
  const myOrders = () => store.get("luna-my-orders", []);
  const remember = (code, phone) => store.set("luna-my-orders", [{ code, phone }, ...myOrders().filter(o => o.code !== code)].slice(0, 10));
  const T_STATUS = {
    cho_thanh_toan: ["Chờ thanh toán", "wait"], cho_xac_nhan: ["Chờ xác nhận", "wait"], da_xac_nhan: ["Đang đóng gói", "go"],
    dang_giao: ["Đang giao", "go"], hoan_thanh: ["Đã giao", "done"], da_huy: ["Đã huỷ", "off"],
  };
  const T_EVENT = {
    cho_thanh_toan: "Đặt hàng thành công, chờ thanh toán", cho_xac_nhan: "Đặt hàng thành công, chờ shop xác nhận",
    da_thanh_toan: "Luna đã nhận thanh toán", da_xac_nhan: "Đơn đã xác nhận, đang đóng gói",
    dang_giao: "Đã giao cho đơn vị vận chuyển", hoan_thanh: "Giao hàng thành công", da_huy: "Đơn đã huỷ",
  };
  const fmtT = t => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  const carrierOf = id => (CFG.carriers || []).find(c => c.id === id);

  function renderMyOrders() {
    const list = myOrders();
    $("myOrders").innerHTML = list.length ? `<div class="my-orders">Đơn đã đặt trên máy này:${list.map(o => `<button type="button" data-track="${esc(o.code)}" data-phone="${esc(o.phone)}">${esc(o.code)}</button>`).join("")}</div>` : "";
  }
  async function lookup(code, phone) {
    code = (code || "").trim().toUpperCase(); phone = normPhone(phone);
    $("tCode").value = code; $("tPhone").value = phone; $("tErr").textContent = "";
    if (!/^LUNA\d{6,}$/.test(code)) { $("tErr").textContent = "Mã đơn có dạng LUNA và các chữ số, ví dụ LUNA30101234."; return; }
    if (!/^0\d{9}$/.test(phone)) { $("tErr").textContent = "Nhập số điện thoại đã dùng khi đặt hàng (10 số)."; return; }
    if (!SB) { $("tErr").textContent = "Chức năng tra cứu chưa sẵn sàng, vui lòng nhắn Zalo shop."; return; }
    const box = $("trackResult"); box.innerHTML = `<p class="lead">Đang tìm đơn…</p>`;
    let o;
    try { o = await rpc("track_order", { p_code: code, p_phone: phone }); }
    catch (e) { box.innerHTML = ""; $("tErr").textContent = "Chưa tra cứu được. Kiểm tra mạng rồi thử lại."; return; }
    if (!o) { box.innerHTML = ""; $("tErr").textContent = "Không tìm thấy đơn. Kiểm tra lại mã đơn và số điện thoại đặt hàng."; return; }
    remember(o.code, phone); renderMyOrders();
    box.innerHTML = trackCard(o);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function trackCard(o) {
    const [label, tone] = T_STATUS[o.status] || [o.status, ""];
    const cancelled = o.status === "da_huy";
    const needPay = !o.paid && !cancelled && o.status === "cho_thanh_toan" && (o.method === "bank" || o.deposit > 0);
    const pay = o.method === "bank" ? o.total : o.deposit;
    // tiến trình 5 bước
    const step2 = o.method === "bank" ? "Thanh toán" : o.deposit > 0 ? "Đặt cọc" : "Xác nhận";
    const at = { cho_thanh_toan: 1, cho_xac_nhan: 1, da_xac_nhan: 2, dang_giao: 3, hoan_thanh: 5 }[o.status] ?? 1;
    const steps = ["Đặt hàng", step2, "Đóng gói", "Đang giao", "Đã giao"];
    const msg = {
      cho_thanh_toan: o.method === "bank" ? "Đơn sẽ được đóng gói ngay khi Luna nhận được chuyển khoản." : `Vui lòng chuyển khoản tiền cọc ${vnd(o.deposit)} để Luna xác nhận đơn.`,
      cho_xac_nhan: "Luna sẽ gọi hoặc nhắn Zalo cho bạn để xác nhận trước khi gửi hàng.",
      da_xac_nhan: "Đơn đã được xác nhận và đang đóng gói, thường gửi đi trong ngày.",
      dang_giao: "Đơn đang trên đường đến bạn, thường mất 1–3 ngày.",
      hoan_thanh: "Đơn đã giao thành công. Cảm ơn bạn đã mua sắm tại Luna!",
      da_huy: `Đơn này đã huỷ. Nếu có nhầm lẫn, vui lòng nhắn Zalo ${CFG.zalo}.`,
    }[o.status] || "";
    const c = carrierOf(o.carrier), b = CFG.bank;
    const link = c && c.url && o.tracking_code ? c.url.replace("{code}", encodeURIComponent(o.tracking_code)) : "";
    const qr = needPay ? `https://img.vietqr.io/image/${b.bin}-${b.acc}-compact2.png?amount=${pay}&addInfo=${encodeURIComponent(o.code)}${b.holder ? `&accountName=${encodeURIComponent(b.holder)}` : ""}` : "";
    return `<article class="panel t-card">
  <div class="t-head"><h2>${esc(o.code)}</h2><span class="t-pill ${tone}">${esc(label)}</span></div>
  <p class="t-msg">${esc(msg)}</p>
  ${cancelled ? "" : `<ol class="steps">${steps.map((s, i) => `<li class="${i < at || at === 5 ? "done" : i === at ? "now" : ""}">${s}</li>`).join("")}</ol>`}
  ${needPay ? `<div class="bank">
    <img class="qr" src="${qr}" alt="Mã QR chuyển khoản ${vnd(pay)}" width="220" height="220">
    <div class="row"><span>Ngân hàng</span><span>${esc(b.name)}</span></div>
    <div class="row"><span>Số tài khoản</span><span>${esc(b.acc)}<button type="button" class="copy" data-copy="${esc(b.acc)}">Chép</button></span></div>
    ${b.holder ? `<div class="row"><span>Chủ tài khoản</span><span>${esc(b.holder)}</span></div>` : ""}
    <div class="row"><span>Số tiền</span><span>${vnd(pay)}</span></div>
    <div class="row"><span>Nội dung</span><span>${esc(o.code)}<button type="button" class="copy" data-copy="${esc(o.code)}">Chép</button></span></div>
  </div>` : ""}
  ${o.tracking_code ? `<div class="ship-box">
    <span>Đơn vị vận chuyển: <strong>${esc(c ? c.name : o.carrier || "Đang cập nhật")}</strong></span>
    <span>Mã vận đơn: <strong>${esc(o.tracking_code)}</strong><button type="button" class="copy" data-copy="${esc(o.tracking_code)}">Chép</button></span>
    ${link ? `<a class="btn dark" href="${esc(link)}" target="_blank" rel="noopener">Xem hành trình trên ${esc(c.name)}</a>` : ""}
  </div>` : ""}
  <div class="t-cols">
    <div><h3>Lịch sử đơn hàng</h3><ol class="timeline">${(o.events || []).map(e => `<li>${esc(T_EVENT[e.status] || e.status)}<time datetime="${esc(e.at)}">${fmtT(e.at)}</time></li>`).join("")}</ol></div>
    <div><h3>Sản phẩm</h3>
      <ul class="t-items">${(o.items || []).map(i => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${vnd(i.price * i.qty)}</span></li>`).join("")}</ul>
      <div class="df" style="padding:12px 0 0;background:none">
        ${o.ship ? `<div class="row"><span>Phí giao hàng</span><span>${vnd(o.ship)}</span></div>` : `<div class="row"><span>Phí giao hàng</span><span>Miễn phí</span></div>`}
        ${o.fee ? `<div class="row"><span>Phí thu hộ</span><span>${vnd(o.fee)}</span></div>` : ""}
        <div class="row total"><span>Tổng cộng</span><span>${vnd(o.total)}</span></div>
        <div class="row"><span>${o.method === "bank" ? "Chuyển khoản" : "COD"}</span><span>${o.paid ? (o.method === "bank" ? "Đã thanh toán" : `Đã cọc ${vnd(o.deposit)} · trả khi nhận ${vnd(o.total - o.deposit)}`) : o.method === "cod" ? (o.deposit ? `Chưa cọc ${vnd(o.deposit)}` : `Trả khi nhận ${vnd(o.total)}`) : "Chưa thanh toán"}</span></div>
      </div>
      <p class="lead" style="font-size:13px;margin-top:10px">Giao tới: ${esc(o.buyer_name)}, ${esc(o.address)}${o.city ? ", " + esc(o.city) : ""}</p>
    </div>
  </div>
</article>`;
  }

  /* ---------- sự kiện ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("button,a");
    if (!t) return;
    const d = t.dataset;
    if (d.track) lookup(d.track, d.phone);
    else if (d.add) {
      if (!add(d.add)) { t.textContent = "Hết hàng"; t.disabled = true; return; }
      t.textContent = "Đã thêm ✓"; t.classList.add("done");
      setTimeout(() => { t.textContent = "Thêm vào giỏ"; t.classList.remove("done"); }, 1100);
    } else if (d.q) { cart[d.q] = Math.min(MAX_QTY, (cart[d.q] || 0) + Number(d.d)); if (cart[d.q] <= 0) delete cart[d.q]; save(); }
    else if (d.step) { pq = Math.max(1, Math.min(MAX_QTY, pq + Number(d.step))); $("pq").textContent = pq; }
    else if (d.addQty) { add(d.addQty, pq); openBag(); }
    else if (d.buyNow) { add(d.buyNow, pq); location.href = "/thanh-toan/"; }
    else if (d.copy) {
      const v = d.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => (t.textContent = "Đã chép")).catch(() => (t.textContent = v));
    }
    else if (t.id === "openBag") openBag();
    else if (t.id === "closeBag" || t.id === "closeF") closeAll();
    else if (t.id === "editCart") openBag();
    else if (shopEl) {
      if (d.tab) { S.tab = d.tab; S.sub = "Tất cả"; renderShop(); }
      else if (d.sub) { S.sub = d.sub; renderShop(); }
      else if (d.flag) { S.flag = d.flag; renderShop(); }
      else if (d.rm) { const i = d.rm.indexOf("|"), k = d.rm.slice(0, i), v = d.rm.slice(i + 1); if (k === "q") { S.q = ""; $("q").value = ""; } else S.sel[k].delete(v); renderShop(); }
      else if ("clear" in d) clearShop();
      else if (t.id === "openF") { $("filters").classList.add("on"); $("scrim").classList.add("on"); }
    }
  });
  $("scrim").addEventListener("click", closeAll);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
  document.addEventListener("change", e => {
    const t = e.target;
    if (shopEl && t.dataset.f) { t.checked ? S.sel[t.dataset.f].add(t.value) : S.sel[t.dataset.f].delete(t.value); renderShop(); }
    if (shopEl && t.id === "sort") { S.sort = t.value; renderShop(); }
    if (checkoutEl && t.name === "pm") { readForm(); form.method = t.value; renderCheckout(); }
    if (checkoutEl && t.id === "fPhone") { readForm(); if (isBlocked(form.phone) && form.method === "cod") { form.method = "bank"; renderCheckout(); } checkPhone(form.phone); }
  });
  document.addEventListener("toggle", e => { const g = e.target.dataset && e.target.dataset.g; if (g) e.target.open ? S.open.add(g) : S.open.delete(g); }, true);
  document.addEventListener("submit", e => { if (e.target.id === "ckForm") { e.preventDefault(); placeOrder(); } });

  /* ---------- khởi động ---------- */
  renderBag();
  if (shopEl) {
    readURL(); renderShop();
    let qt; const qi = $("q");
    qi.closest("form").addEventListener("submit", e => { e.preventDefault(); S.q = qi.value.trim(); renderShop(); });
    qi.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = qi.value.trim(); renderShop(); }, 150); });
  }
  if (checkoutEl) { renderCheckout(); checkPhone(form.phone); syncCart().then(() => { if (!lastOrder) renderCheckout(); }); }
  if (trackEl) {
    renderMyOrders();
    $("trackForm").addEventListener("submit", e => { e.preventDefault(); lookup($("tCode").value, $("tPhone").value); });
    const ma = new URLSearchParams(location.search).get("ma");
    if (ma) {
      const known = myOrders().find(o => o.code === ma.toUpperCase());
      $("tCode").value = ma.toUpperCase();
      if (known) lookup(known.code, known.phone); else $("tPhone").focus();
    }
  }
})();
