/* Luna Admin — đọc sản phẩm từ web hãng / nhà cung cấp và chuyển sang dạng sản phẩm của Luna.
   Hỗ trợ: Shopify (vd obagi.vn), WooCommerce (Store API), trang có dữ liệu chuẩn JSON-LD / Open Graph.
   File này không gọi mạng: admin.js tải dữ liệu rồi đưa vào đây. */
(function (g) {
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const uniq = a => [...new Set(a.filter(Boolean))];
  const round1000 = n => Math.round(n / 1000) * 1000;
  const absUrl = (u, base) => { try { return u ? new URL(u, base || "https://x.invalid").toString() : ""; } catch (e) { return ""; } };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // tìm từ khoá (đã bỏ dấu) có ranh giới từ; trả về vị trí đầu tiên hoặc -1
  const findKw = (text, kw) => { const m = new RegExp(`(?:^|[^a-z0-9])${esc(kw)}(?![a-z])`).exec(text); return m ? m.index + (m[0].length - kw.length) : -1; };
  const countKw = (text, kw) => (text.match(new RegExp(`(?:^|[^a-z0-9])${esc(kw)}(?![a-z])`, "g")) || []).length;

  /* ---------- dung tích ---------- */
  const SIZE_RE = /(\d+(?:[.,]\d+)?)\s?(ml|mL|g|gr|gram|oz|fl\.?\s?oz|miếng|mieng|pcs|viên|vien|gói|goi|tuýp)(?![a-zA-Zà-ỹ])/i;
  function findSize(text) {
    const m = SIZE_RE.exec(text || "");
    if (!m) return "";
    let unit = m[2].toLowerCase().replace(/^gr(am)?$/, "g").replace("mieng", "miếng").replace("vien", "viên").replace("goi", "gói");
    if (unit === "ml") unit = "ml";
    return `${m[1].replace(",", ".")}${/^(ml|g|oz)$/.test(unit) ? "" : " "}${unit}`;
  }
  // dung tích ghi trong mô tả, chỉ lấy khi có nhãn rõ ràng ("Dung tích: 30ml")
  function labeledSize(html) {
    const t = String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
    const m = /(dung tích|thể tích|trọng lượng|khối lượng|quy cách|size|net wt\.?)[^0-9]{0,25}(\d+(?:[.,]\d+)?\s?[a-zA-Zà-ỹ.]+)/i.exec(t);
    return m ? findSize(m[2]) : "";
  }

  /* ---------- danh mục ---------- */
  const SUB_RULES = [
    ["Bộ sản phẩm", "skincare", ["bo doi", "bo ba", "bo tu", "bo san pham", "combo", "set qua", "gift set", "duo", "trio", "kit"]],
    ["Chống nắng", "skincare", ["chong nang", "sunscreen", "sunshield", "sun shield", "sunblock", "spf"]],
    ["Làm sạch", "skincare", ["sua rua mat", "rua mat", "tay trang", "cleanser", "cleansing", "foaming gel", "micellar", "gel rua", "nuoc tay trang", "sua tam", "dau tam", "gel tam", "gel moussant", "moussant", "gel douche", "huile de douche", "body wash", "shower", "h2o", "lingettes", "wipes", "makeup remover"]],
    ["Toner", "skincare", ["toner", "nuoc can bang", "nuoc hoa hong", "lotion can bang", "tonique", "tonic"]],
    ["Mặt nạ", "skincare", ["mat na", "mask", "masque"]],
    ["Tẩy tế bào chết", "skincare", ["peel", "pad", "pads", "tay te bao", "tay da chet", "exfoliant", "exfoliating", "scrub"]],
    ["Serum", "skincare", ["serum", "tinh chat", "essence", "ampoule", "concentrate", "booster", "treatment"]],
    ["Kem dưỡng", "skincare", ["kem duong", "son duong", "kem mat", "eye cream", "moisturizer", "moisturiser", "cream", "creme", "lotion", "gel cream", "duong am", "hydrating"]],
    ["Môi", "makeup", ["son", "lipstick", "lip tint", "son kem", "son thoi"]],
    ["Nền", "makeup", ["cushion", "kem nen", "foundation", "phan phu", "che khuyet diem", "concealer", "kem lot", "primer"]],
    ["Má & mắt", "makeup", ["ma hong", "blush", "phan mat", "eyeshadow", "mascara", "ke mat", "eyeliner", "chi ke may", "highlight"]],
  ];
  function pickSub(title, type, tags) {
    const best = text => {
      let win = null;
      for (const [sub, cat, kws] of SUB_RULES) for (const kw of kws) {
        const i = findKw(text, kw);
        if (i >= 0 && (!win || i < win.i || (i === win.i && kw.length > win.len))) win = { sub, cat, i, len: kw.length };
      }
      return win;
    };
    const w = best(norm(title)) || best(norm(type)) || best(norm(tags.join(" | ")));
    // "Moisturizer SPF 50", "Day cream SPF30" → kem chống nắng
    if ((!w || w.sub === "Kem dưỡng") && /\bspf\s?\d{2}/.test(norm(title))) return { sub: "Chống nắng", cat: "skincare" };
    return w ? { sub: w.sub, cat: w.cat } : { sub: "Kem dưỡng", cat: "skincare" };
  }

  /* ---------- hoạt chất / nhu cầu / loại da ---------- */
  const ACTIVE_RULES = [
    ["Retinol", ["retinol", "retinal", "retinaldehyde", "retinoid", "retivance"]],
    ["Vitamin C", ["vitamin c", "ascorbic", "ascorbyl", "professional-c"]],
    ["Niacinamide", ["niacinamide", "vitamin b3"]],
    ["BHA", ["bha", "salicylic"]],
    ["AHA", ["aha", "glycolic", "lactic acid", "mandelic"]],
    ["PHA", ["pha", "gluconolactone", "lactobionic"]],
    ["Hyaluronic Acid", ["hyaluronic", "hyaluronate"]],
    ["Ceramide", ["ceramide", "ceramides"]],
    ["Peptide", ["peptide", "peptides"]],
    ["Rau má", ["rau ma", "centella", "cica", "madecassoside"]],
    ["Panthenol", ["panthenol", "vitamin b5"]],
    ["Arbutin", ["arbutin", "alpha arbutin"]],
    ["Tranexamic Acid", ["tranexamic"]],
    ["Kinetin", ["kinetin"]],
    ["Bakuchiol", ["bakuchiol"]],
    ["Vitamin E", ["vitamin e", "tocopherol"]],
    ["Màng lọc khoáng", ["zinc oxide", "titanium dioxide", "khoang chat"]],
  ];
  const CONCERN_RULES = [
    ["Mụn", ["mun", "acne", "blemish", "clenziderm", "breakout"]],
    ["Lỗ chân lông", ["lo chan long", "pore", "pores"]],
    ["Lão hoá", ["lao hoa", "nep nhan", "anti-aging", "anti aging", "wrinkle", "wrinkles", "fine lines", "san chac", "tre hoa", "nang co", "elastiderm", "firming"]],
    ["Thâm & sáng da", ["mo tham", "vet tham", "tham mun", "tham nam", "nam da", "sang da", "deu mau", "uneven", "uneven-tone", "pigment", "hyperpigmentation", "dark spot", "brightening", "claribright"]],
    ["Cấp ẩm", ["cap am", "duong am", "hydrat", "hydrate", "hydrating", "hydrators", "moisture", "dry", "mat nuoc"]],
    ["Nhạy cảm", ["nhay cam", "sensitive", "lam diu", "diu nhe", "phuc hoi", "barrier", "rebalance", "calming"]],
  ];
  const ACTIVE_CONCERN = { Retinol: ["Lão hoá"], "Vitamin C": ["Thâm & sáng da"], Niacinamide: ["Thâm & sáng da"], BHA: ["Mụn", "Lỗ chân lông"], AHA: ["Thâm & sáng da"], Arbutin: ["Thâm & sáng da"], "Tranexamic Acid": ["Thâm & sáng da"], "Hyaluronic Acid": ["Cấp ẩm"], Ceramide: ["Cấp ẩm", "Nhạy cảm"], Peptide: ["Lão hoá"], "Rau má": ["Nhạy cảm"], Panthenol: ["Nhạy cảm"], Bakuchiol: ["Lão hoá"] };
  const SKIN_RULES = [
    ["Da dầu", ["da dau", "oily", "normal to oily"]],
    ["Da khô", ["da kho", "normal to dry", "dry skin"]],
    ["Da hỗn hợp", ["da hon hop", "combination"]],
    ["Da nhạy cảm", ["da nhay cam", "sensitive skin", "sensitive"]],
    ["Mọi loại da", ["moi loai da", "all skin", "tat ca loai da"]],
  ];
  // khớp ở tiêu đề/tags là chắc chắn; trong mô tả cần lặp lại >= minBody lần
  function detect(rules, head, body, minBody, max) {
    const hit = [];
    rules.forEach(([name, kws]) => {
      const inHead = kws.some(k => findKw(head, k) >= 0);
      const n = kws.reduce((s, k) => s + countKw(body, k), 0);
      if (inHead || n >= minBody) hit.push({ name, score: (inHead ? 100 : 0) + n });
    });
    return hit.sort((a, b) => b.score - a.score).slice(0, max).map(h => h.name);
  }

  /* ---------- làm sạch mô tả ---------- */
  const H_HOWTO = /^(huong dan su dung|cach su dung|cach dung|huong dan|how to use|directions)/;
  const H_INGR = /^(thanh phan|bang thanh phan|ingredients|key ingredients|thanh phan chinh|thanh phan noi bat)/;
  const H_STOP = /^(goi y routine|tham khao|tim hieu them|xem them|bai viet|lien he|mua ngay|chinh sach|dat hang|san pham lien quan|cau hoi thuong gap|faq|review|danh gia)/;
  const isHeading = s => {
    if (s.length > 70) return false;
    const letters = s.replace(/[^\p{L}]/gu, "");
    return /:$/.test(s) || (letters.length >= 3 && letters === letters.toUpperCase());
  };
  // HTML → các dòng chữ (giữ gạch đầu dòng, bỏ link, ảnh, nút bấm)
  function textLines(html, keepButtons) {
    const d = new DOMParser().parseFromString(String(html || ""), "text/html");
    d.querySelectorAll(`script,style,iframe,img,video,svg,noscript,form,picture,source${keepButtons ? "" : ",button"}`).forEach(e => e.remove());
    d.querySelectorAll("br").forEach(e => e.replaceWith("\n"));
    d.querySelectorAll("li").forEach(e => e.prepend("• "));
    d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr,section,ul,ol,blockquote,dt,dd,summary,button,span.h6").forEach(e => e.append("\n"));
    return (d.body ? d.body.textContent : "").split("\n").map(s => s.replace(/\s+/g, " ").trim())
      .filter(s => s.replace(/[•\-–*\s]/g, "").length > 1 && !/https?:\/\//i.test(s));
  }
  const capLines = (arr, max) => { let s = ""; for (const l of arr) { if ((s + "\n" + l).length > max) break; s += (s ? "\n" : "") + l; } return s; };
  function cleanHtml(html) {
    const out = { desc: [], howto: [], ingredients: [] };
    if (!html) return { desc: "", howto: "", ingredients: "" };
    const lines = textLines(html);
    let cur = "desc";
    for (const line of lines) {
      const n = norm(line.replace(/^[•\-–*\s]+/, ""));
      if (isHeading(line) || H_HOWTO.test(n) || H_INGR.test(n) || H_STOP.test(n)) {
        if (H_STOP.test(n)) { cur = "skip"; continue; }
        if (H_HOWTO.test(n)) { cur = "howto"; const rest = line.replace(/^[^:]*:\s*/, ""); if (rest && rest !== line) out.howto.push(rest); continue; }
        if (H_INGR.test(n)) { cur = "ingredients"; const rest = line.replace(/^[^:]*:\s*/, ""); if (rest && rest !== line) out.ingredients.push(rest); continue; }
        cur = "desc";
      }
      if (cur !== "skip") out[cur].push(line);
    }
    return { desc: capLines(out.desc, 2500), howto: capLines(out.howto, 1200), ingredients: capLines(out.ingredients, 2000) };
  }

  /* ---------- trang sản phẩm của hãng: lấy Cách dùng, Thành phần ---------- */
  // Các mục lớn thường gặp trên trang sản phẩm; gặp mục khác thì dừng
  const H_SECTION = /^(muc dich su dung|cong dung|thong tin an toan|cach bao quan|bao quan|luu y|doi tuong|ket qua|cam ket|chi tiet san pham|mo ta|thong tin san pham|goi y routine|tham khao|tim hieu them|xem them|cau hoi|danh gia|san pham lien quan|ban co the thich|khach hang|ve chung toi|ho tro|lien he|dang ky|chinh sach)/;
  // Các tab / accordion trên trang: [{ title, el }]
  function sectionsOf(d) {
    const out = [], used = new Set();
    const push = (t, el) => { const title = (t || "").replace(/\s+/g, " ").trim(); if (el && title && title.length < 60 && !used.has(el)) { used.add(el); out.push({ title, el }); } };
    d.querySelectorAll("[aria-controls],[data-bs-target],[data-target],a[href^='#']").forEach(b => {
      const id = (b.getAttribute("aria-controls") || b.getAttribute("data-bs-target") || b.getAttribute("data-target") || b.getAttribute("href") || "").replace(/^#/, "");
      if (!id || id.length > 100 || /\s/.test(id)) return;
      const p = d.getElementById(id);
      if (p && p !== b && !p.contains(b)) push(b.textContent, p);
    });
    d.querySelectorAll("details > summary").forEach(sm => { const box = sm.parentElement.cloneNode(true); box.querySelector("summary").remove(); push(sm.textContent, box); });
    return out;
  }
  const H_DESC = /^(chi tiet|mo ta|thong tin san pham|thong tin|cong dung|gioi thieu|dac diem|description|details|overview|product details|muc dich su dung)/;
  function extractPage(html) {
    const res = { howto: "", ingredients: "", desc: "" };
    if (!html) return res;
    const d = new DOMParser().parseFromString(String(html), "text/html");
    d.querySelectorAll("script,style,noscript,svg,header,footer,nav,[class*=footer],[class*=header]:not([class*=accordion]):not([class*=tab]):not([class*=card-header]):not([class*=collapse]):not([class*=panel]),[class*=cart-drawer],[class*=newsletter],[id*=footer],[id*=header]").forEach(e => e.remove());
    // 1) tab / accordion: tiêu đề + khung nội dung
    const descParts = [];
    sectionsOf(d).forEach(({ title, el }) => {
      const n = norm(title.replace(/[:\s]+$/, ""));
      const lines = textLines(el.innerHTML);
      if (!lines.length) return;
      if (!res.howto && H_HOWTO.test(n)) res.howto = capLines(lines, 1500);
      else if (!res.ingredients && H_INGR.test(n)) res.ingredients = capLines(lines, 2500);
      else if (H_DESC.test(n)) descParts.push({ rank: /^cong dung/.test(n) ? 1 : 0, lines });
    });
    // không có tab mô tả: lấy khối có tiêu đề "Thông tin sản phẩm" / "Mô tả"
    if (!descParts.some(p => p.rank === 0)) {
      const hd = [...d.querySelectorAll("h2,h3,h4,.title,[class*=title]")].find(h => h.textContent.length < 50 && /^(thong tin san pham|mo ta san pham|mo ta|chi tiet san pham|product details|description)$/.test(norm(h.textContent.trim().replace(/[:\s]+$/, ""))));
      if (hd && hd.parentElement) { const box = hd.parentElement.cloneNode(true); [...box.children].forEach(c => { if (c.textContent.trim() === hd.textContent.trim()) c.remove(); }); const lines = textLines(box.innerHTML); if (lines.length) descParts.push({ rank: 0, lines }); }
    }
    descParts.sort((a, b) => a.rank - b.rank);
    res.desc = capLines(descParts.slice(0, 2).flatMap(p => p.lines), 2500);
    // 2) quét chữ trên trang: dòng tiêu đề "Hướng dẫn sử dụng" / "Thành phần" và các dòng sau nó
    if (!res.howto || !res.ingredients) {
      const main = d.querySelector("main") || d.body;
      const lines = main ? textLines(main.innerHTML, true) : [];
      const grab = re => {
        for (let i = 0; i < lines.length; i++) {
          const n = norm(lines[i]);
          if (lines[i].length > 80 || !re.test(n)) continue;
          const rest = lines[i].replace(/^[^:]*:\s*/, "");
          const out = rest && rest !== lines[i] ? [rest] : [];
          for (let j = i + 1; j < lines.length && out.join("\n").length < 1500; j++) {
            const m = norm(lines[j]);
            if (lines[j].length < 60 && (H_SECTION.test(m) || H_HOWTO.test(m) || H_INGR.test(m))) break;
            out.push(lines[j]);
          }
          if (out.length) return capLines(out, 1500);
        }
        return "";
      };
      if (!res.howto) res.howto = grab(H_HOWTO);
      if (!res.ingredients) res.ingredients = grab(H_INGR);
    }
    return res;
  }

  /* ---------- đọc dữ liệu từng nền tảng ---------- */
  const tagList = t => (Array.isArray(t) ? t : String(t || "").split(",")).map(x => (typeof x === "string" ? x : x && x.name) || "").map(s => s.trim()).filter(Boolean);
  function fromShopify(p, origin) {
    const vs = (p.variants || []).length ? p.variants : [{}];
    const multi = vs.length > 1;
    const imgs = (p.images || []).map(i => absUrl(i.src || i, origin)).filter(Boolean);
    return vs.map(v => {
      const vt = v.title && v.title !== "Default Title" ? v.title : "";
      const vImg = v.featured_image && absUrl(v.featured_image.src, origin);
      const price = Math.round(Number(v.price) || 0), cmp = Math.round(Number(v.compare_at_price) || 0);
      const size = findSize(vt) || findSize(p.title) || labeledSize(p.body_html);
      return {
        key: `shopify-${p.id}-${v.id || 0}`, group: `shopify-${p.id}`, label: size || vt,
        sourceUrl: `${origin}/products/${p.handle}`,
        name: p.title,
        vendor: p.vendor || "", vol: size,
        price: cmp > price ? cmp : price, salePrice: cmp > price ? price : 0,
        images: uniq([vImg, ...imgs]), html: p.body_html || "",
        sku: v.sku || "", available: v.available !== false, type: p.product_type || "", tags: tagList(p.tags),
      };
    });
  }
  function fromWoo(p) {
    const pr = p.prices || {}, k = 10 ** (Number(pr.currency_minor_unit) || 0);
    const reg = Math.round((Number(pr.regular_price) || Number(pr.price) || 0) / k), cur = Math.round((Number(pr.price) || 0) / k);
    return [{
      key: `woo-${p.id}`, sourceUrl: p.permalink || "", name: p.name || "",
      vendor: ((p.brands || [])[0] || {}).name || "", vol: findSize(p.name) || labeledSize(p.description),
      price: reg || cur, salePrice: cur && reg && cur < reg ? cur : 0,
      images: uniq((p.images || []).map(i => i.src)), html: p.description || p.short_description || "",
      sku: p.sku || "", available: p.is_in_stock !== false,
      type: (p.categories || []).map(c => c.name).join(", "), tags: tagList(p.tags),
    }];
  }
  function fromHtml(html, pageUrl, ldOnly) {
    const d = new DOMParser().parseFromString(html, "text/html");
    const nodes = [];
    d.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { const j = JSON.parse(s.textContent); (Array.isArray(j) ? j : [j]).forEach(x => nodes.push(...(x["@graph"] || [x]))); } catch (e) {}
    });
    const isType = (n, t) => [].concat(n["@type"] || []).includes(t);
    const items = nodes.filter(n => isType(n, "Product")).map((n, i) => {
      const offers = [].concat(n.offers || [])[0] || {};
      const price = Math.round(Number(offers.price || offers.lowPrice || (offers.priceSpecification || {}).price) || 0);
      return {
        key: `ld-${i}-${n.sku || n.name}`, sourceUrl: absUrl(n.url || pageUrl, pageUrl), name: n.name || "",
        vendor: (typeof n.brand === "string" ? n.brand : (n.brand || {}).name) || "", vol: findSize(n.name),
        price, salePrice: 0, images: uniq([].concat(n.image || []).map(x => absUrl(typeof x === "string" ? x : x.url, pageUrl))),
        html: (n.description || "").replace(/\n/g, "<br>"), sku: n.sku || "",
        available: !/OutOfStock/i.test(offers.availability || ""), type: n.category || "", tags: [],
      };
    });
    if (items.length || ldOnly) return items;
    const meta = p => (d.querySelector(`meta[property="${p}"],meta[name="${p}"]`) || {}).content || "";
    const title = meta("og:title") || (d.querySelector("h1") || {}).textContent || "";
    if (!title.trim()) return [];
    return [{
      key: `og-${pageUrl}`, sourceUrl: pageUrl, name: title.trim(), vendor: meta("product:brand") || "", vol: findSize(title),
      price: Math.round(Number(meta("product:price:amount") || meta("og:price:amount")) || 0), salePrice: 0,
      images: uniq([absUrl(meta("og:image"), pageUrl)]), html: meta("og:description") || meta("description"),
      sku: "", available: true, type: "", tags: [],
    }];
  }

  /* ---------- web tự làm: đoán tên, giá, ảnh từ HTML ---------- */
  const MONEY = /(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s?(?:đ|₫|vnđ|vnd|đồng)/i;
  const moneyOf = t => { const m = MONEY.exec(t || ""); return m ? Number(m[1].replace(/[.,]/g, "")) : 0; };
  const JUNK = "[class*=related],[class*=top-product],[class*=suggest],[class*=recommend],[class*=upsell],[class*=cross-sell],[class*=recent],[class*=footer],[class*=header],[class*=menu],[class*=navbar],[class*=logo],[class*=banner],[class*=blog],[class*=popup],[class*=cart],footer,header,nav";
  const imgSrc = i => { const ss = (i.getAttribute("srcset") || i.getAttribute("data-srcset") || "").split(",").map(x => x.trim().split(" ")[0]).filter(Boolean); return i.getAttribute("data-src") || i.getAttribute("data-lazy-src") || i.getAttribute("data-original") || i.getAttribute("data-zoom-image") || ss[ss.length - 1] || i.getAttribute("src") || ""; };
  // cùng một ảnh nhưng khác cỡ (Drupal /styles/x/public/, ?itok=, -300x300) chỉ lấy 1
  const imgKey = u => u.replace(/\/styles\/[^/]+\/public\//, "/").replace(/[?#].*$/, "").replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").toLowerCase();
  const uniqImg = list => { const seen = new Set(); return list.filter(u => { const k = imgKey(u); if (!u || seen.has(k)) return false; seen.add(k); return true; }); };
  function fromGenericPage(html, pageUrl) {
    const d = new DOMParser().parseFromString(String(html || ""), "text/html");
    const meta = p => ((d.querySelector(`meta[property="${p}"],meta[name="${p}"]`) || {}).content || "").trim();
    d.querySelectorAll("script,style,noscript,svg").forEach(e => e.remove());
    const pick = sel => [...d.querySelectorAll(sel)].find(e => !e.closest(JUNK) && e.textContent.trim().length > 2 && e.textContent.trim().length < 200);
    const nameEl = pick("[itemprop=name]") || pick("h1") || pick("[class*=detail][class*=name],[class*=detail][class*=title]") || pick("[class*=product][class*=name],[class*=product][class*=title]");
    const siteName = meta("og:site_name");
    const name = ((nameEl && nameEl.textContent) || meta("og:title") || "").replace(/\s+/g, " ").trim().replace(siteName ? new RegExp(`\\s*[|\\-–]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) : /$^/, "");
    if (!name) return [];
    // vùng sản phẩm: đi lên từ tên tới khi gặp giá
    let scope = nameEl || d.body;
    for (let i = 0; nameEl && i < 8 && scope.parentElement && !MONEY.test(scope.textContent); i++) scope = scope.parentElement;
    if (!MONEY.test(scope.textContent)) scope = d.body;
    const leaves = [...scope.querySelectorAll("*")].filter(e => !e.closest(JUNK) && [...e.childNodes].some(n => n.nodeType === 3 && MONEY.test(n.textContent)));
    const isOld = e => !!e.closest("del,s,strike,[class*=old],[class*=compare],[class*=regular],[class*=original],[class*=line-through],[class*=before],[class*=list-price]");
    const cur = leaves.filter(e => !isOld(e)), old = leaves.filter(isOld);
    const nowP = moneyOf((cur.find(e => /price|gia/i.test(e.className + " " + (e.parentElement || {}).className)) || cur[0] || {}).textContent) || Math.round(Number(meta("product:price:amount")) || 0);
    const oldP = moneyOf((old[0] || {}).textContent);
    // ảnh: og:image + ảnh trong khu bộ sưu tập
    const imgs = [];
    const og = meta("og:image"); if (og) imgs.push(absUrl(og, pageUrl));
    d.querySelectorAll("img").forEach(i => {
      if (i.closest(JUNK)) return;
      const box = i.closest("[class*=gallery],[class*=thumb],[class*=product-image],[class*=product-img],[class*=product-photo],[class*=slider],[class*=swiper],[class*=carousel],[class*=zoom],[class*=product-media],[class*=detail-img]");
      if (!box && !scope.contains(i)) return;
      const u = absUrl(imgSrc(i), pageUrl);
      if (u && !/\.svg(\?|$)|logo|icon|sprite|placeholder|loading/i.test(u)) imgs.push(u);
    });
    // dung tích: nút / nhãn ngắn trong vùng sản phẩm
    const sizeEl = [...scope.querySelectorAll("button,label,option,span,a,li")].find(e => !e.closest(JUNK) && e.textContent.trim().length <= 14 && findSize(e.textContent.trim()) && findSize(e.textContent.trim()).length >= e.textContent.trim().replace(/\s/g, "").length - 2);
    const x = extractPage(html);
    const out = (x.desc || meta("og:description") || meta("description")).split("\n").map(l => `<p>${l.replace(/[<>&]/g, "")}</p>`).join("");
    return [{
      key: `page-${pageUrl}`, sourceUrl: pageUrl, name, vendor: meta("product:brand") || cleanBrand(siteName),
      vol: (sizeEl && findSize(sizeEl.textContent.trim())) || findSize(name) || labeledSize(scope.innerHTML),
      price: oldP > nowP ? oldP : nowP, salePrice: oldP > nowP ? nowP : 0,
      images: uniqImg(imgs).slice(0, 6), html: out, extra: { howto: x.howto, ingredients: x.ingredients },
      sku: "", available: !/hết hàng|het hang|out of stock|tạm hết|ngừng kinh doanh/i.test(scope.textContent.slice(0, 3000)), type: "", tags: [],
    }];
  }
  // Trang sản phẩm: JSON-LD trước, không có thì đoán từ HTML (cần có giá)
  // noPrice: trang lấy từ sitemap / danh sách → nhận cả trang không ghi giá (web giới thiệu của hãng), nếu trông giống trang sản phẩm
  function fromPage(html, pageUrl, noPrice) {
    const ld = fromHtml(html, pageUrl, true);
    if (ld.length) return ld;
    const g = fromGenericPage(html, pageUrl);
    return g.filter(x => x.price > 0 || (noPrice && x.images.length && (x.extra.howto || x.extra.ingredients)));
  }
  // Link sản phẩm trên trang danh sách: link nằm trong "thẻ" có ảnh và giá
  const SKIP_PATH = /^\/(cart|gio-hang|account|tai-khoan|login|dang-nhap|register|blog|tin-tuc|news|tag|tags|search|tim-kiem|page|pages|lien-he|contact|chinh-sach|policy|collections|danh-muc|category|categories)(\/|$)/i;
  function productLinks(html, pageUrl) {
    const d = new DOMParser().parseFromString(String(html || ""), "text/html");
    const here = new URL(pageUrl), out = new Set();
    d.querySelectorAll("a[href]").forEach(a => {
      let u; try { u = new URL(a.getAttribute("href"), pageUrl); } catch (e) { return; }
      if (u.origin !== here.origin || u.pathname === here.pathname || SKIP_PATH.test(u.pathname) || u.pathname.split("/").filter(Boolean).length < 1) return;
      if (a.closest("header,footer,nav,[class*=menu],[class*=navbar],[class*=related],[class*=suggest],[class*=recommend],[class*=upsell],[class*=cross-sell],[class*=recent],[class*=top-product]")) return;
      let box = a, ok = false;
      for (let i = 0; i < 5 && box; i++, box = box.parentElement) if (box.querySelector && box.querySelector("img") && MONEY.test(box.textContent) && box.textContent.length < 1500) { ok = true; break; }
      if (ok) out.add(u.origin + u.pathname);
    });
    return [...out];
  }
  // Link cùng web nằm "dưới" trang danh sách (vd /san-pham → /san-pham/sensibio, /san-pham/sensibio/h2o)
  const listPrefix = pageUrl => new URL(pageUrl).pathname.replace(/\/+$/, "");
  function linksUnder(html, pageUrl, prefix) {
    if (!prefix) return [];
    const d = new DOMParser().parseFromString(String(html || ""), "text/html"), o = new URL(pageUrl).origin, out = new Set();
    d.querySelectorAll("a[href]").forEach(a => {
      let u; try { u = new URL(a.getAttribute("href"), pageUrl); } catch (e) { return; }
      const p = u.pathname.replace(/\/+$/, "");
      if (u.origin === o && p.startsWith(prefix + "/") && !/\.(jpe?g|png|webp|gif|pdf|svg)$/i.test(p)) out.add(o + p);
    });
    return [...out];
  }
  const sitemapLocs = xml => [...String(xml || "").matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)].map(m => m[1].replace(/&amp;/g, "&"));
  // Lọc link sản phẩm trong sitemap theo đường dẫn trang danh sách (vd /product → /product/xxx)
  function filterSitemap(urls, pageUrl) {
    const here = new URL(pageUrl);
    const prefix = here.pathname.replace(/\/+$/, "");
    const same = urls.filter(u => { try { return new URL(u).host === here.host; } catch (e) { return false; } });
    const under = prefix ? same.filter(u => new URL(u).pathname.startsWith(prefix + "/")) : [];
    // bỏ trang danh mục: link là "cha" của link khác (vd /san-pham/atoderm khi có /san-pham/atoderm/gel-douche)
    const dropParents = list => { const set = list.map(u => new URL(u).pathname.replace(/\/+$/, "")); return list.filter((u, i) => !set.some((p, j) => j !== i && p.startsWith(set[i] + "/"))); };
    if (under.length) return uniq(dropParents(under));
    return uniq(same.filter(u => /\/(products?|san-pham|sp|p|item|shop)\/[^/]+\/?$/i.test(new URL(u).pathname)));
  }

  /* ---------- kế hoạch tải theo link ---------- */
  function plan(input) {
    const u = new URL(input.trim()), o = u.origin, parts = u.pathname.split("/").filter(Boolean);
    const out = [];
    const pi = parts.indexOf("products"), ci = parts.indexOf("collections");
    if (pi >= 0 && parts[pi + 1]) out.push({ kind: "shopify-one", url: `${o}/products/${parts[pi + 1].replace(/\.(json|js)$/, "")}.json` });
    else if (ci >= 0 && parts[ci + 1]) out.push({ kind: "shopify-list", url: `${o}/collections/${parts[ci + 1]}/products.json?limit=250` });
    else out.push({ kind: "shopify-list", url: `${o}/products.json?limit=250` });
    const wi = parts.findIndex(p => p === "product" || p === "san-pham");
    out.push({ kind: "woo", url: wi >= 0 && parts[wi + 1] ? `${o}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(parts[wi + 1])}` : `${o}/wp-json/wc/store/v1/products?per_page=100` });
    out.push({ kind: "html", url: u.toString() });
    return out;
  }
  const cleanBrand = v => (v || "").replace(/\s*[-–|]\s*(viet\s?nam|việt\s?nam|vn|official|store|shop|chinh hang|chính hãng).*$/i, "").replace(/\s+(viet\s?nam|việt\s?nam|vn)$/i, "").trim();
  const hostBrand = url => { try { const h = new URL(url).hostname.replace(/^www\./, "").split(".")[0]; return h.charAt(0).toUpperCase() + h.slice(1); } catch (e) { return ""; } };

  /* ---------- chuyển thành sản phẩm Luna ---------- */
  const SHAPE = { "Làm sạch": "tube", Toner: "bottle", Serum: "dropper", "Kem dưỡng": "jar", "Chống nắng": "tube", "Tẩy tế bào chết": "bottle", "Mặt nạ": "jar", "Bộ sản phẩm": "jar", Môi: "lipstick", Nền: "compact", "Má & mắt": "compact" };
  const TINT = { "Làm sạch": "#f3e3dc", Toner: "#e4ecf1", Serum: "#f2e6d6", "Kem dưỡng": "#f5e9e2", "Chống nắng": "#fbf0d9", "Tẩy tế bào chết": "#f3ead8", "Mặt nạ": "#e3eee6", "Bộ sản phẩm": "#efe4ef", Môi: "#f0d6d0", Nền: "#f3e2d4", "Má & mắt": "#f7ddd2" };
  // Giá bán: giữ giá hãng, hoặc giảm x% so với giá hãng đang bán
  function calcPrice(item, opts) {
    const price = item.price;
    let sale = item.salePrice || null;
    if (opts.priceMode === "discount" && opts.pct > 0) {
      const base = item.salePrice || item.price, s = round1000(base * (1 - opts.pct / 100));
      sale = s > 0 && s < price ? s : sale;
    }
    return { price, sale };
  }
  function toProduct(item, opts) {
    const c = cleanHtml(item.html);
    if (item.extra) { c.howto = c.howto || item.extra.howto || ""; c.ingredients = item.extra.ingredients || c.ingredients; if (!c.desc && item.extra.desc) c.desc = item.extra.desc; }
    const head = norm([item.name, item.type, item.tags.join(" | ")].join(" | "));
    const body = norm(c.desc + "\n" + c.howto + "\n" + c.ingredients);
    const { sub, cat } = pickSub(item.name, item.type, item.tags);
    const actives = detect(ACTIVE_RULES, norm(item.name + " | " + item.tags.join(" | ")), body, 2, 4);
    let concerns = detect(CONCERN_RULES, head, body, 2, 3);
    actives.forEach(a => (ACTIVE_CONCERN[a] || []).forEach(x => { if (!concerns.includes(x) && concerns.length < 3) concerns.push(x); }));
    let skin = detect(SKIN_RULES, head, body, 1, 5);
    if (skin.includes("Mọi loại da") || skin.length >= 4 || !skin.length) skin = ["Mọi loại da"];
    const finalCat = opts.cat && opts.cat !== "auto" ? opts.cat : cat;
    const { price, sale } = calcPrice(item, opts);
    return {
      name: item.name.trim().slice(0, 200), brand: (opts.brand || cleanBrand(item.vendor) || hostBrand(item.sourceUrl)).slice(0, 80),
      origin: opts.origin || "", cat: finalCat, sub: finalCat === "makeup" && cat !== "makeup" ? "Nền" : sub, vol: item.vol || "",
      price, sale, is_new: true, in_stock: item.available, visible: !!opts.visible, pop: 5,
      actives, skin, concerns: finalCat === "makeup" ? [] : concerns,
      images: item.images.slice(0, 5), descr: c.desc, howto: c.howto, ingredients: c.ingredients,
      shape: SHAPE[sub] || "bottle", tint: TINT[sub] || "#f2e6d6",
    };
  }

  g.LunaImport = { plan, fromShopify, fromWoo, fromHtml, fromPage, fromGenericPage, productLinks, linksUnder, listPrefix, sitemapLocs, filterSitemap, toProduct, calcPrice, cleanHtml, extractPage, pickSub, findSize, cleanBrand, hostBrand, norm,
    SUBS: SUB_RULES.map(r => r[0]), MAKEUP: SUB_RULES.filter(r => r[1] === "makeup").map(r => r[0]), SHAPE, TINT };
})(typeof window !== "undefined" ? window : globalThis);
