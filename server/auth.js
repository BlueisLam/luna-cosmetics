// Dùng chung cho Pages Functions: kiểm tra người gọi là admin (token đăng nhập Supabase).
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function requireAdmin(request, env, SITE) {
  const url = (env.SUPABASE_URL || SITE.supabase.url).replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY || SITE.supabase.anonKey;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json(401, { error: "Chưa đăng nhập" }) };
  const auth = { apikey: key, Authorization: `Bearer ${token}` };
  const u = await fetch(`${url}/auth/v1/user`, { headers: auth });
  if (!u.ok) return { error: json(401, { error: "Phiên đăng nhập hết hạn, hãy đăng nhập lại" }) };
  const user = await u.json();
  const a = await fetch(`${url}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: auth });
  const rows = a.ok ? await a.json() : [];
  if (!rows.length) return { error: json(403, { error: "Tài khoản không có quyền admin" }) };
  return { user };
}
