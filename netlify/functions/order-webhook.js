// Supabase Database Webhook (bảng orders, sự kiện INSERT) → nhắn Telegram báo đơn mới.
// Cần biến môi trường trên Netlify: WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
const SITE = require("../../site.json");
const vnd = n => (Number(n) || 0).toLocaleString("vi-VN").replace(/,/g, ".") + "đ";

exports.handler = async event => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Chỉ nhận POST" };
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || event.headers["x-webhook-secret"] !== secret) return { statusCode: 401, body: "Sai mã bí mật" };

  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "JSON lỗi" }; }
  const o = p.record;
  if (p.type !== "INSERT" || p.table !== "orders" || !o) return { statusCode: 200, body: "bỏ qua" };

  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { statusCode: 500, body: "Chưa cài TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID" };

  const lines = [
    `🛍 Đơn mới ${o.code}`,
    `${o.method === "bank" ? "Chuyển khoản" : "COD"} · Tổng ${vnd(o.total)}${o.method === "cod" && o.deposit ? ` · cọc ${vnd(o.deposit)}` : ""}`,
    `${o.buyer_name} · ${o.phone}`,
    `${o.address}${o.city ? ", " + o.city : ""}`,
    ...(o.items || []).map(i => `• ${i.qty} × ${i.name}`),
    o.note ? `Ghi chú: ${o.note}` : "",
    o.method === "cod" ? "→ Nhớ gọi/nhắn Zalo xác nhận trước khi gửi" : "→ Chờ khách chuyển khoản",
    `${SITE.url.replace(/\/$/, "")}/admin/`,
  ].filter(Boolean);

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: lines.join("\n"), disable_web_page_preview: true }),
  });
  if (!r.ok) return { statusCode: 502, body: `Telegram lỗi ${r.status}: ${await r.text()}` };
  return { statusCode: 200, body: "ok" };
};
