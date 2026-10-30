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
  const isBlocked = s => (CFG.blockedPhones || []).map(normPhone).includes(normPhone(s));

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
  const add = (id, q = 1) => { cart[id] = (cart[id] || 0) + q; save(); };

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
      <div class="row save"><span>Chuyển khoản trước: miễn phí giao hàng</span><span>−${vnd(CFG.shipFee)}</span></div>
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
  const CITIES = ["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng", "Cà Mau", "Tỉnh thành khác"];

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
    const items = Object.entries(cart);
    if (!items.length) {
      checkoutEl.innerHTML = `<div class="done-box"><h1 class="display">Giỏ hàng đang trống</h1><p class="lead">Chọn sản phẩm trước rồi quay lại thanh toán nhé.</p><p><a class="btn" href="/cua-hang/">Xem sản phẩm</a></p></div>`;
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
        <fieldset><legend>Thông tin nhận hàng</legend>
          <label class="f" for="fName">Họ tên<input id="fName" value="${esc(form.name)}" autocomplete="name" placeholder="Nguyễn Thị Lan" required></label>
          <div class="two">
            <label class="f" for="fPhone">Số điện thoại<input id="fPhone" value="${esc(form.phone)}" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" required></label>
            <label class="f" for="fCity">Tỉnh / thành<select id="fCity">${CITIES.map(c => `<option${c === form.city ? " selected" : ""}>${c}</option>`).join("")}</select></label>
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
  function placeOrder() {
    readForm();
    const err = [];
    if (form.name.length < 2) err.push("Vui lòng nhập họ tên.");
    if (!/^0(3|5|7|8|9)\d{8}$/.test(form.phone)) err.push("Số điện thoại chưa đúng (ví dụ 0912345678).");
    if (form.addr.length < 6) err.push("Vui lòng nhập địa chỉ đầy đủ.");
    if (form.method === "cod" && (isBlocked(form.phone) || subtotal() > CFG.codMax)) { form.method = "bank"; renderCheckout(); $("fErr").textContent = "Đơn này chỉ nhận chuyển khoản, đã chuyển sang hình thức chuyển khoản."; return; }
    if (err.length) { $("fErr").textContent = err.join(" "); return; }
    const q = quote(form.method);
    lastOrder = { code: "LUNA" + Date.now().toString().slice(-6), at: new Date().toISOString(), method: form.method, ...q,
      items: Object.entries(cart).map(([id, n]) => ({ id: +id, name: byId(id).name, qty: n, price: priceOf(byId(id)) })),
      buyer: { name: form.name, phone: form.phone, addr: form.addr, city: form.city, note: form.note } };
    // Giai đoạn 2: gửi đơn về Supabase. Tạm thời lưu trên máy khách.
    const orders = store.get("luna-orders", []); orders.push(lastOrder); store.set("luna-orders", orders);
    cart = {}; store.set("luna-cart", cart); renderBag();
    renderDone(); window.scrollTo(0, 0);
  }
  function renderDone() {
    const o = lastOrder, pay = o.method === "bank" ? o.total : o.deposit, b = CFG.bank;
    const qr = `https://img.vietqr.io/image/${b.bin}-${b.acc}-compact2.png?amount=${pay}&addInfo=${encodeURIComponent(o.code)}&accountName=${encodeURIComponent(b.holder)}`;
    checkoutEl.innerHTML = `<div class="done-box">
      <h1 class="display">Cảm ơn ${esc(o.buyer.name.split(" ").pop())}!</h1>
      <p>Mã đơn <strong>${o.code}</strong></p>
      ${pay ? `<p class="lead" style="margin:0 auto">${o.method === "bank" ? "Quét mã để chuyển khoản, Luna đóng gói đơn ngay khi nhận tiền:" : "Chuyển khoản tiền cọc để xác nhận đơn COD:"}</p>
      <img class="qr" src="${qr}" alt="Mã QR chuyển khoản ${vnd(pay)}" width="220" height="220">
      <div class="bank">
        <div class="row"><span>Ngân hàng</span><span>${esc(b.name)}</span></div>
        <div class="row"><span>Số tài khoản</span><span>${esc(b.acc)}<button type="button" class="copy" data-copy="${esc(b.acc)}">Chép</button></span></div>
        <div class="row"><span>Chủ tài khoản</span><span>${esc(b.holder)}</span></div>
        <div class="row"><span>Số tiền</span><span>${vnd(pay)}</span></div>
        <div class="row"><span>Nội dung</span><span>${o.code}<button type="button" class="copy" data-copy="${o.code}">Chép</button></span></div>
      </div>
      <p class="lead" style="margin:0 auto">${o.method === "cod" ? `Còn lại ${vnd(o.total - o.deposit)} trả khi nhận hàng.` : "Giao 1–3 ngày, miễn phí giao hàng."}</p>`
      : `<p class="lead" style="margin:0 auto">Bạn trả ${vnd(o.total)} khi nhận hàng.</p>`}
      ${o.method === "cod" ? `<div class="note" style="text-align:left"><strong>Đơn COD chỉ được gửi sau khi xác nhận.</strong> Luna sẽ gọi hoặc nhắn Zalo cho bạn trong giờ làm việc. Bạn cũng có thể nhắn Zalo <strong>${esc(CFG.zalo)}</strong><button type="button" class="copy" data-copy="${esc(CFG.zalo.replace(/\s/g, ""))}">Chép</button> kèm mã đơn <strong>${o.code}</strong> để được gửi sớm hơn.</div>` : ""}
      <p><a class="btn ghost" href="/cua-hang/">Tiếp tục mua sắm</a></p>
    </div>`;
  }

  /* ---------- sự kiện ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("button,a");
    if (!t) return;
    const d = t.dataset;
    if (d.add) {
      add(d.add);
      t.textContent = "Đã thêm ✓"; t.classList.add("done");
      setTimeout(() => { t.textContent = "Thêm vào giỏ"; t.classList.remove("done"); }, 1100);
    } else if (d.q) { cart[d.q] = (cart[d.q] || 0) + Number(d.d); if (cart[d.q] <= 0) delete cart[d.q]; save(); }
    else if (d.step) { pq = Math.max(1, Math.min(20, pq + Number(d.step))); $("pq").textContent = pq; }
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
    if (checkoutEl && t.id === "fPhone") { readForm(); if (isBlocked(form.phone) && form.method === "cod") form.method = "bank"; renderCheckout(); }
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
  if (checkoutEl) renderCheckout();
})();
