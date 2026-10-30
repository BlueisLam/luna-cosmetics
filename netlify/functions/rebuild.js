// Nút "Cập nhật web" trên trang admin → kiểm tra đúng là admin → gọi Netlify build hook.
// Cần biến môi trường trên Netlify: BUILD_HOOK_URL
const SITE = require("../../site.json");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== "POST") return json(405, { error: "Chỉ nhận POST" });
  const url = (process.env.SUPABASE_URL || SITE.supabase.url).replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || SITE.supabase.anonKey;
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return json(500, { error: "Chưa cài BUILD_HOOK_URL trên Netlify (xem README)" });

  const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Chưa đăng nhập" });

  const auth = { apikey: key, Authorization: `Bearer ${token}` };
  const u = await fetch(`${url}/auth/v1/user`, { headers: auth });
  if (!u.ok) return json(401, { error: "Phiên đăng nhập hết hạn, hãy đăng nhập lại" });
  const user = await u.json();

  const a = await fetch(`${url}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: auth });
  const rows = a.ok ? await a.json() : [];
  if (!rows.length) return json(403, { error: "Tài khoản không có quyền admin" });

  const r = await fetch(hook, { method: "POST" });
  if (!r.ok) return json(502, { error: `Netlify từ chối build hook (HTTP ${r.status})` });
  return json(200, { ok: true });
};
