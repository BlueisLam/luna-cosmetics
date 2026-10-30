# Luna Cosmetics

Web bán skincare & makeup cao cấp. Web tĩnh nhiều trang, chuẩn SEO, deploy trên Netlify.

## Cấu trúc

| File / thư mục | Dùng để |
|---|---|
| `site.json` | Thông tin shop: tên miền, hotline, Zalo, số tài khoản, quy tắc COD, danh sách số chặn COD |
| `data/products.json` | Danh sách sản phẩm |
| `data/taxonomy.json` | Mô tả danh mục, nhu cầu da, hoạt chất, nội dung các trang chính sách |
| `assets/` | Giao diện (`style.css`) và xử lý giỏ hàng, bộ lọc, thanh toán (`app.js`) |
| `public/` | File tĩnh copy thẳng ra web (favicon, ảnh sản phẩm…) |
| `build.js` | Tạo toàn bộ trang vào `dist/` |

## Các trang được tạo

- Trang chủ, `/cua-hang/` (bộ lọc đầy đủ, tìm kiếm)
- Danh mục: `/skincare/`, `/makeup/` và danh mục con như `/skincare/serum/`
- Nhu cầu da: `/nhu-cau/mun/`, `/nhu-cau/tham-sang-da/`…
- Thương hiệu: `/thuong-hieu/<tên>/` · Hoạt chất: `/hoat-chat/niacinamide/`…
- Bộ sưu tập: `/hang-moi-ve/`, `/ban-chay/`, `/khuyen-mai/`
- Mỗi sản phẩm một trang: `/san-pham/<tên-sản-phẩm-thương-hiệu>/`
- Thanh toán `/thanh-toan/`, chính sách `/chinh-sach/...`, `/lien-he/`, `404`
- `sitemap.xml`, `robots.txt`, dữ liệu sản phẩm cho Google (Product schema, breadcrumb)

## Thêm / sửa sản phẩm

Mở `data/products.json`, thêm một mục:

```json
{"id":23,"cat":"skincare","sub":"Serum","brand":"Tên hãng","origin":"Hàn","name":"Tên sản phẩm","vol":"30ml",
 "price":990000,"sale":850000,"isNew":true,
 "actives":["Niacinamide"],"skin":["Da dầu"],"concerns":["Thâm & sáng da"],"pop":7,
 "images":["/images/ten-san-pham-1.jpg"],
 "desc":"Mô tả ngắn, tự viết.","howto":"Cách dùng.","ingredients":"Bảng thành phần (không bắt buộc)",
 "shape":"dropper","tint":"#f2e6d6"}
```

- `id`: số không trùng. `cat`: `skincare` hoặc `makeup`.
- `sale`: bỏ đi nếu không giảm giá. `isNew`: bỏ đi khi hết là hàng mới.
- `concerns` phải dùng đúng tên trong `taxonomy.json`: Mụn, Thâm & sáng da, Lão hoá, Cấp ẩm, Nhạy cảm, Lỗ chân lông.
- `pop`: 1–10, càng cao càng được xếp lên đầu. Từ 9 trở lên hiện ở mục Bán chạy.
- `inStock: false` khi hết hàng.
- **Ảnh**: bỏ ảnh vào `public/images/`, ghi đường dẫn vào `images`. Chưa có ảnh thì web dùng hình minh hoạ tạm, nhưng Google Mua sắm bắt buộc phải có ảnh thật.

Đẩy lên GitHub là Netlify tự build lại trong khoảng 1 phút.

## Chạy thử trên máy

```bash
npm run dev     # build rồi mở http://localhost:3000
```

## Khi mua tên miền

1. Sửa `"url"` trong `site.json` thành tên miền mới (ví dụ `https://lunacosmetics.vn`), đẩy lên GitHub.
2. Netlify → Domain management → Add domain, làm theo hướng dẫn trỏ DNS. Netlify tự cấp HTTPS.
3. Google Search Console → thêm tên miền → gửi `https://<tên-miền>/sitemap.xml`.
4. Google Merchant Center → đăng ký, nối với Search Console để hiện sản phẩm ở tab Mua sắm.

## Việc của Giai đoạn 2

- Đơn hàng hiện chỉ lưu trên trình duyệt khách. Cần nối Supabase để shop nhận đơn.
- Danh sách số chặn COD đang nằm trong `site.json` (ai xem mã nguồn cũng thấy). Sẽ chuyển vào Supabase.
- Trang quản lý sản phẩm, đơn hàng; báo đơn mới qua Telegram/email.
- Điền số tài khoản thật và mã BIN ngân hàng vào `site.json` để mã QR VietQR quét được (Vietcombank `970436`, Techcombank `970407`, MB `970422`, ACB `970416`…).
