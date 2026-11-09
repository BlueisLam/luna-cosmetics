// Cloudflare Pages Function: POST /api/rebuild
// Nút "Cập nhật web" trên admin → kiểm tra đúng là admin → gọi Deploy hook của Cloudflare Pages.
// Biến môi trường (Cloudflare → Settings → Variables and Secrets): BUILD_HOOK_URL
import SITE from "../../site.json";
import { json, requireAdmin } from "../../server/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.BUILD_HOOK_URL) return json(500, { error: "Chưa cài BUILD_HOOK_URL trên Cloudflare (xem README)" });
  const a = await requireAdmin(request, env, SITE);
  if (a.error) return a.error;
  const r = await fetch(env.BUILD_HOOK_URL, { method: "POST" });
  if (!r.ok) return json(502, { error: `Cloudflare từ chối deploy hook (HTTP ${r.status})` });
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { error: "Chỉ nhận POST" });
