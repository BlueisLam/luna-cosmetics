# Luna Cosmetics

Web bán skincare & makeup cao cấp. Web tĩnh nhiều trang chuẩn SEO trên Cloudflare Pages, đơn hàng và sản phẩm lưu trên Supabase, quản lý tại `/admin/`.

## Đưa web lên Cloudflare Pages (làm 1 lần)

1. Vào **dash.cloudflare.com** → **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git** → chọn GitHub, repo `luna-cosmetics`.
2. Cấu hình build:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `node scripts/fetch-data.js && node build.js`
   - Build output directory: `dist`
3. **Save and Deploy**. Khoảng 1–2 phút sau có link dạng `https://<tên-project>.pages.dev`.
4. Nếu link không phải `https://luna-cosmetics.pages.dev`: vào **Settings → Variables and Secrets** thêm biến `SITE_URL` = link của bạn (không có dấu `/` cuối), rồi **Deployments → ⋯ → Retry deployment**.

Lưu ý Cloudflare: thêm hoặc đổi biến môi trường xong phải **Retry deployment** thì mới có hiệu lực.

## Cài đặt Supabase (làm 1 lần)

### 1. Tạo bảng và nạp sản phẩm mẫu
Supabase → **SQL Editor** → **New query**:
1. Dán toàn bộ `supabase/schema.sql` → **Run**.
2. Tạo query mới, dán `supabase/seed.sql` → **Run** (22 sản phẩm mẫu, sửa/xoá sau trên admin).

### 2. Tạo tài khoản admin
1. **Authentication → Users → Add user → Create new user**: nhập email + mật khẩu, tick **Auto Confirm User**.
2. SQL Editor, chạy (thay email của bạn):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'email-cua-ban@gmail.com';
   ```
3. **Authentication → Sign In / Providers**: tắt **Allow new users to sign up** để người lạ không tự tạo tài khoản.

Trang admin: `https://<web>/admin/`

### 3. Nút "Cập nhật web" trên admin
Sửa sản phẩm trên admin xong, web cần build lại để khách thấy.
1. Cloudflare → project → **Settings → Builds → Deploy hooks → Add deploy hook**, tên `Admin`, nhánh `main` → copy link.
2. **Settings → Variables and Secrets → Add**: loại **Secret**, tên `BUILD_HOOK_URL`, giá trị = link vừa copy.
3. **Deployments → ⋯ → Retry deployment** ở bản mới nhất để áp dụng.

### 4. Báo đơn mới qua Telegram (không bắt buộc)
Trang admin đang mở sẽ tự báo đơn mới (có tiếng). Muốn nhận cả khi không mở admin:
1. Telegram: nhắn **@BotFather** → `/newbot` → lấy **token**.
2. Nhắn một tin bất kỳ cho bot vừa tạo, rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates` → tìm `"chat":{"id":...}` → đó là **chat id**.
3. Cloudflare → **Settings → Variables and Secrets**, thêm (loại Secret):
   - `TELEGRAM_BOT_TOKEN` = token
   - `TELEGRAM_CHAT_ID` = chat id
   - `WEBHOOK_SECRET` = một chuỗi ngẫu nhiên tự đặt (ví dụ `luna-8f3k2m9x`)
4. Supabase → **Database → Webhooks → Create a new hook**: bảng `orders`, sự kiện **Insert**, loại **HTTP Request**, method **POST**, URL `https://<web>/api/order-webhook`, thêm header `x-webhook-secret` = chuỗi ở bước 3.
5. **Retry deployment** trên Cloudflare.

### 5. Cập nhật database cho tính năng theo dõi đơn
Nếu bạn đã chạy `schema.sql` trước khi có tính năng tra cứu đơn: chạy lại **toàn bộ** `supabase/schema.sql` một lần nữa. File chạy lại an toàn, không mất dữ liệu. Không cần chạy lại `seed.sql`.

## Khách theo dõi đơn hàng

- Trang `/don-hang/` (menu "Tra cứu đơn"): khách nhập **mã đơn + số điện thoại đặt hàng**. Phải khớp cả hai mới xem được.
- Trên máy đã đặt hàng, web nhớ sẵn đơn, khách bấm là xem ngay, không cần gõ lại.
- Khách thấy: tiến trình 5 bước, lịch sử từng mốc, đơn vị vận chuyển + mã vận đơn + nút xem hành trình, và mã QR để thanh toán lại nếu chưa chuyển khoản.
- Đơn "Bom hàng" hiện với khách là "Đã huỷ".

Trên admin, mỗi đơn có ô **Đơn vị vận chuyển** và **Mã vận đơn**. Nhập mã vận đơn thì đơn tự chuyển sang "Đang giao". Nút **Chép tin báo khách** chép sẵn tin nhắn có mã vận đơn và link theo dõi để dán vào Zalo.

Link xem hành trình của từng hãng nằm trong `site.json` → `carriers` (`{code}` là chỗ điền mã vận đơn). Hãng nào để `url` trống thì web chỉ hiện mã vận đơn để khách tự tra. Bạn nên bấm thử link của từng hãng sau lần gửi hàng đầu tiên, nếu hãng đổi đường dẫn thì sửa lại trong file này.

## Nhập sản phẩm từ web hãng / nhà cung cấp

Admin → **Sản phẩm** → **Nhập từ web hãng**. Dán link trang danh mục (ví dụ `https://www.obagi.vn/collections/shop-all`) hoặc link một trang sản phẩm, bấm **Tải danh sách sản phẩm**.
- Hỗ trợ web làm bằng **Shopify** (obagi.vn…), **WooCommerce**, trang có dữ liệu chuẩn (JSON-LD), và **web hãng tự làm** (imageskincare.vn…): dán link trang danh sách, admin tự tìm link sản phẩm trên trang hoặc trong sitemap rồi đọc từng trang (tên, giá, giá gốc, dung tích, ảnh, Chi tiết / Cách dùng / Thành phần). Web chỉ giới thiệu, không ghi giá (bioderma.com.vn, hàng PRO cho spa…): vẫn đọc được tên, ảnh, mô tả, cách dùng, thành phần; mỗi dòng có ô **Giá bán** để bạn điền, điền xong dòng đó mới được chọn nhập. Nếu trang danh sách chỉ dẫn tới các trang dòng sản phẩm, admin tự đi tiếp vào từng dòng để tìm hết sản phẩm (tối đa 300 trang).
- Web tự làm đọc từng trang nên chậm hơn (khoảng 1–2 phút cho 60–70 sản phẩm). Nếu đọc sai, dán link từng trang sản phẩm hoặc sửa tay trước khi nhập.
- Tự lấy: tên, dung tích, giá (cả giá gốc nếu hãng đang giảm), ảnh, mô tả. Bật "Lấy thêm Cách dùng & Thành phần" để mở trang từng sản phẩm của hãng lấy hai mục này (từ tab / accordion hoặc khối "Hướng dẫn sử dụng"). Sản phẩm có nhiều biến thể (dung tích) được gom thành phân loại. Tự đoán danh mục, hoạt chất, nhu cầu, loại da. Bỏ phần "gợi ý routine", link bài viết của hãng.
- Trước khi nhập: sửa tên, dung tích, danh mục từng món; chọn thương hiệu, xuất xứ, giá bán (giữ giá hãng hoặc giảm x%) cho cả lần nhập.
- Ảnh được chép về kho ảnh của shop (Supabase Storage), không phụ thuộc web hãng.
- Mặc định nhập ở chế độ **ẩn**: kiểm tra, viết lại mô tả, nhập kho rồi mới bật "Hiện trên web" và bấm Cập nhật web.
- Sản phẩm trùng tên với sản phẩm đã có được gắn "Đã có" và bỏ qua.

Lưu ý: nên viết lại mô tả bằng lời của shop (Google ưu tiên nội dung riêng), và chỉ dùng ảnh khi được hãng hoặc nhà phân phối cho phép. Một số web chặn máy chủ đọc tự động; khi đó dán link từng trang sản phẩm hoặc thêm tay.

## Phân loại hàng (dung tích, màu…)

Admin → Sản phẩm → **Sửa** → mục **Phân loại hàng** → **+ Thêm phân loại**. Mỗi phân loại có tên (ví dụ 50ml), giá, giá sale, còn hàng / hàng order riêng. Phân loại đầu tiên là dung tích và giá của chính sản phẩm.
- Web: thẻ sản phẩm ghi "Từ <giá thấp nhất>" và nút **Chọn phân loại**; trang sản phẩm có các nút chọn phân loại, giá đổi theo lựa chọn.
- Kho: mỗi phân loại có tồn kho, giá vốn riêng (mục Kho hiện từng phân loại).
- Đơn hàng, tra cứu, thống kê ghi rõ phân loại (ví dụ "Kem chống nắng · 30ml").
- Tên, thương hiệu, danh mục, ẩn/hiện của phân loại luôn theo sản phẩm chính.

## Hàng order (không có sẵn, khách đặt rồi mới nhập)

Sửa sản phẩm → tick **Hàng order** và ghi **Thời gian giao hàng order** (ví dụ 7–14 ngày). Có thể đặt riêng cho từng phân loại (cột "Order").
- Web: khách **không thấy chữ "order" hay "đặt trước"**. Sản phẩm trông như hàng bình thường (nút Thêm vào giỏ / Mua ngay), chỉ có dòng "Thời gian giao dự kiến: …" và nhắc cọc khi chọn COD. Không bao giờ hiện "Hết hàng". Tra cứu đơn hiện "Đang chuẩn bị hàng".
- Admin vẫn thấy rõ: nhãn Order trên sản phẩm và món trong đơn, trạng thái đơn **Chờ hàng về**.
- Thanh toán: đơn có hàng order mà chọn COD phải **cọc trước** (mặc định 50%, đổi ở Cài đặt → "Đơn có hàng order: cọc trước"). Chuyển khoản thì trả đủ như bình thường.
- Kho: hàng order vẫn bán khi kho = 0; kho chuyển thành số âm = số khách đã đặt chờ nhập. Mục Kho → bộ lọc **Cần nhập** cho biết cần nhập bao nhiêu cái. Nhập hàng về thì số tự trừ dần.
- Đơn hàng: món order có nhãn "Order". Khi đang đợi hàng, chuyển đơn sang **Chờ hàng về** để khách tra cứu thấy.

## Quản lý kho

Mục **Kho** trên admin. Sản phẩm "Chưa quản lý kho" bán không giới hạn như trước. Bấm **Nhập hàng** lần đầu (kèm giá vốn) là sản phẩm bắt đầu được quản lý:
- Mỗi đơn tự trừ kho. Đơn huỷ hoặc bom hàng tự hoàn kho, mở lại đơn thì trừ lại.
- Hết kho: web tự đổi sang "Hết hàng", khách không đặt quá số tồn. Hai khách cùng mua món cuối cùng thì chỉ một người mua được.
- Nhập hàng nhiều lô giá khác nhau, giá vốn tự tính bình quân.
- **Kiểm kê**: nhập số đếm thực tế, hệ thống tự ghi chênh lệch. **Hàng hỏng / hết hạn** và **Khách trả hàng** cũng có mục riêng.
- Lịch sử nhập xuất của từng sản phẩm, mã SKU, mức báo "Sắp hết", ước tính còn đủ bán bao nhiêu ngày.
- Giá vốn và số tồn **chỉ admin xem được**, khách không thể đọc.

Lưu ý: đơn chuyển khoản chưa thanh toán vẫn giữ hàng trong kho. Nếu khách không chuyển khoản, hãy đổi đơn sang "Đã huỷ" để trả hàng về kho.

## Thống kê

Mục **Thống kê**: chọn Hôm nay / 7 ngày / 30 ngày / Tháng này / Tháng trước / Tất cả.
- Doanh thu (chỉ tiền hàng của đơn đã xác nhận trở đi), giá trị trung bình mỗi đơn, lợi nhuận gộp và biên lợi nhuận, đơn đang chờ xử lý, tỷ lệ bom hàng COD, khách mua lại.
- Biểu đồ doanh thu theo ngày, top 10 sản phẩm bán chạy, chuyển khoản so với COD, trạng thái đơn, tỉnh/thành nhiều đơn.
- **Xuất file đơn hàng (CSV)** mở được bằng Excel hoặc Google Sheets.

## Trang admin làm được gì

- **Đơn hàng**: lọc theo trạng thái, tìm theo mã/tên/SĐT, đổi trạng thái, đánh dấu đã nhận tiền/cọc, nhắn Zalo, gọi, ghi chú nội bộ. Bấm **Bom hàng** để chặn COD số đó ngay.
- **Sản phẩm**: thêm, sửa, tải ảnh, bật sale, hàng mới về, hết hàng, ẩn/hiện.
- **Chặn COD**: thêm/bỏ số điện thoại bị chặn. Khách bị chặn vẫn đặt được nếu chuyển khoản trước.
- **Cài đặt**: phí ship COD, phí thu hộ, mức cọc, mức tối đa nhận COD.

Trạng thái đơn: Chờ thanh toán (chuyển khoản, hoặc COD cần cọc) → Chờ xác nhận (COD) → Đã xác nhận → Đang giao → Hoàn thành / Bom hàng / Đã huỷ.

## Bảo mật

- Giá, phí ship, tiền cọc được tính lại trên Supabase (`place_order`), khách sửa giá trên trình duyệt cũng không có tác dụng.
- Khách không đọc được đơn của người khác, cũng không xem được danh sách số bị chặn.
- Mỗi số điện thoại tối đa 5 đơn trong 10 phút để chống spam.
- Khoá `publishable`/`anon` trong `site.json` được phép công khai. **Không bao giờ** đưa khoá `secret`/`service_role` vào code.

## Cấu trúc

| File / thư mục | Dùng để |
|---|---|
| `site.json` | Thông tin shop, tên miền, Zalo, **số tài khoản ngân hàng**, khoá Supabase |
| `supabase/` | `schema.sql` (bảng, bảo mật, hàm đặt hàng), `seed.sql` (sản phẩm mẫu) |
| `admin/` | Trang quản lý |
| `functions/api/` | Cloudflare Pages Functions: `rebuild` (nút Cập nhật web), `order-webhook` (báo Telegram), `fetch-url` (đọc web hãng, chỉ admin) |
| `server/auth.js` | Kiểm tra quyền admin, dùng chung cho các function |
| `admin/import-map.js` | Đọc dữ liệu Shopify / WooCommerce / JSON-LD / web tự làm (sitemap) và chuyển thành sản phẩm |
| `public/_headers` | Header bảo mật và chống cache code cũ |
| `data/products.json` | Sản phẩm dự phòng khi chưa nối Supabase |
| `data/taxonomy.json` | Mô tả danh mục, nhu cầu da, hoạt chất, nội dung trang chính sách |
| `assets/` | Giao diện và giỏ hàng, bộ lọc, thanh toán |
| `scripts/fetch-data.js` | Lấy sản phẩm từ Supabase lúc build |
| `build.js` | Tạo toàn bộ trang vào `dist/` |

## Số tài khoản và mã QR

Điền vào `site.json` → `order.bank`: tên ngân hàng, `bin` (mã ngân hàng), số tài khoản, tên chủ tài khoản. Mã BIN thường gặp: Vietcombank `970436`, Techcombank `970407`, MB `970422`, ACB `970416`, VPBank `970432`, BIDV `970418`, VietinBank `970415`, TPBank `970423`.

## Khi mua tên miền

1. Cloudflare → project → **Custom domains → Set up a custom domain**, nhập tên miền và làm theo hướng dẫn (tên miền quản lý trên Cloudflare thì tự động trỏ).
2. Đổi biến `SITE_URL` (hoặc `"url"` trong `site.json`) thành tên miền mới, rồi Retry deployment.
3. Supabase → Authentication → URL Configuration: đổi Site URL sang tên miền mới.
4. Google Search Console → thêm tên miền, chọn xác minh bằng thẻ HTML, dán phần `content` vào `"googleSiteVerification"` trong `site.json`, đẩy lên rồi bấm Xác minh. Sau đó gửi `https://<tên-miền>/sitemap.xml`.
5. Google Merchant Center (hiện sản phẩm miễn phí ở tab Mua sắm của Google) → Sản phẩm → Nguồn dữ liệu → thêm nguồn theo đường link `https://<tên-miền>/google-merchant.xml`, lấy định kỳ mỗi ngày.

## SEO đã có sẵn

- Mỗi trang có tiêu đề, mô tả, link chuẩn (canonical), ảnh khi chia sẻ Facebook/Zalo (ảnh sản phẩm, hoặc `public/og.png` cho trang khác).
- Dữ liệu cho Google: cửa hàng (logo, liên hệ, đổi trả 7 ngày), sản phẩm (giá, còn hàng, phân loại, giao hàng miễn phí khi chuyển khoản, đổi trả), đường dẫn (breadcrumb), danh sách sản phẩm.
- Sitemap có kèm ảnh sản phẩm; trang danh mục / thương hiệu nhiều sản phẩm tự chia trang (48 sản phẩm / trang).
- Nguồn dữ liệu Google Merchant: `/google-merchant.xml` (sản phẩm có ảnh mới vào nguồn).
- Chân trang có link tới mọi danh mục, thương hiệu, nhu cầu để Google đi được khắp web.
- Lưu ý: link sản phẩm tạo từ **tên + thương hiệu**. Khi Google đã lên trang, hạn chế đổi tên sản phẩm (đổi tên là đổi link).
- Viết mô tả bằng lời của shop (không chép nguyên văn web hãng) giúp lên top tốt hơn; mục Sản phẩm có bộ lọc **Thiếu mô tả**, **Thiếu ảnh** để bổ sung dần.

## Quản lý nhiều sản phẩm

- Admin → Sản phẩm: lọc theo thương hiệu, danh mục, trạng thái (đang ẩn, hết hàng, đang giảm giá, thiếu ảnh, thiếu mô tả…), sắp xếp, 50 sản phẩm / trang.
- Tick ô vuông đầu dòng (hoặc **Chọn tất cả sản phẩm đang lọc**) để sửa hàng loạt: hiện / ẩn, gắn Mới về, **giảm giá theo % hoặc số tiền**, bỏ giảm giá, tăng / giảm giá gốc theo %, đổi danh mục, đổi thương hiệu, xoá.
- **Xuất file Excel (CSV)** → sửa cột `gia_goc`, `gia_sale` (hoặc `giam_pct`), `hien`, `con_hang`, `moi_ve` → **Cập nhật giá bằng file CSV**: xem trước các thay đổi rồi mới bấm cập nhật.
- Sửa một sản phẩm: mục **Giảm giá** chọn *Giảm theo %*, *Giảm số tiền* hoặc *Nhập giá sau giảm*; nút **Áp dụng cho mọi phân loại**.

## Chạy thử trên máy

```bash
npm run dev
```
