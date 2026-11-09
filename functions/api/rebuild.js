// Cloudflare Pages Function: POST /api/rebuild
// Nút "Cập nhật web" trên admin → kiểm tra đúng là admin → gọi Deploy hook của Cloudflare Pages.
// Biến môi trường (Cloudflare → Settings → Variables and Secrets): BUILD_HOOK_URL
import SITE from "../../site.json";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  const url = (env.SUPABASE_URL || SITE.supabase.url).replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY || SITE.supabase.anonKey;
  if (!env.BUILD_HOOK_URL) return json(500, { error: "Chưa cài BUILD_HOOK_URL trên Cloudflare (xem README)" });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Chưa đăng nhập" });

  const auth = { apikey: key, Authorization: `Bearer ${token}` };
  const u = await fetch(`${url}/auth/v1/user`, { headers: auth });
  if (!u.ok) return json(401, { error: "Phiên đăng nhập hết hạn, hãy đăng nhập lại" });
  const user = await u.json();

  const a = await fetch(`${url}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: auth });
  const rows = a.ok ? await a.json() : [];
  if (!rows.length) return json(403, { error: "Tài khoản không có quyền admin" });

  const r = await fetch(env.BUILD_HOOK_URL, { method: "POST" });
  if (!r.ok) return json(502, { error: `Cloudflare từ chối deploy hook (HTTP ${r.status})` });
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { error: "Chỉ nhận POST" });
