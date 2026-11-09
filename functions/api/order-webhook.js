// Cloudflare Pages Function: POST /api/order-webhook
// Supabase Database Webhook (bảng orders, sự kiện INSERT) → nhắn Telegram báo đơn mới.
// Biến môi trường: WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
const vnd = n => (Number(n) || 0).toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
const text = (status, body) => new Response(body, { status });

export async function onRequestPost({ request, env }) {
  if (!env.WEBHOOK_SECRET || request.headers.get("x-webhook-secret") !== env.WEBHOOK_SECRET) return text(401, "Sai mã bí mật");

  let p;
  try { p = await request.json(); } catch (e) { return text(400, "JSON lỗi"); }
  const o = p.record;
  if (p.type !== "INSERT" || p.table !== "orders" || !o) return text(200, "bỏ qua");
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return text(500, "Chưa cài TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");

  const origin = new URL(request.url).origin; // link admin theo đúng tên miền đang chạy
  const lines = [
    `🛍 Đơn mới ${o.code}`,
    `${o.method === "bank" ? "Chuyển khoản" : "COD"} · Tổng ${vnd(o.total)}${o.method === "cod" && o.deposit ? ` · cọc ${vnd(o.deposit)}` : ""}`,
    `${o.buyer_name} · ${o.phone}`,
    `${o.address}${o.city ? ", " + o.city : ""}`,
    ...(o.items || []).map(i => `• ${i.qty} × ${i.name}`),
    o.note ? `Ghi chú: ${o.note}` : "",
    o.method === "cod" ? "→ Nhớ gọi/nhắn Zalo xác nhận trước khi gửi" : "→ Chờ khách chuyển khoản",
    `${origin}/admin/`,
  ].filter(Boolean);

  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: lines.join("\n"), disable_web_page_preview: true }),
  });
  if (!r.ok) return text(502, `Telegram lỗi ${r.status}: ${await r.text()}`);
  return text(200, "ok");
}

export const onRequest = () => text(405, "Chỉ nhận POST");
