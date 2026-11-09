// Cloudflare Pages Function: POST /api/fetch-url  { url }
// Trang admin dùng để đọc web hãng / nhà cung cấp (trình duyệt không tự đọc được vì chặn CORS).
// Chỉ admin gọi được. Không xử lý nội dung ở đây (Cloudflare free chỉ có 10 ms CPU), chỉ chuyển tiếp.
import SITE from "../../site.json";
import { json, requireAdmin } from "../../server/auth.js";

const BLOCKED_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/;
const MAX_BYTES = 15 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const a = await requireAdmin(request, env, SITE);
  if (a.error) return a.error;

  let target;
  try { target = new URL((await request.json()).url); } catch (e) { return json(400, { error: "Link không hợp lệ" }); }
  if (!/^https?:$/.test(target.protocol)) return json(400, { error: "Chỉ hỗ trợ link http/https" });
  if (!env.ALLOW_PRIVATE_FETCH && (BLOCKED_HOST.test(target.hostname) || IP_HOST.test(target.hostname))) return json(400, { error: "Không hỗ trợ địa chỉ này" });
  if (target.host === new URL(request.url).host) return json(400, { error: "Không đọc chính web của shop" });

  let r;
  try {
    r = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LunaCosmeticsImporter/1.0)", Accept: "application/json, text/html;q=0.9, image/*;q=0.8, */*;q=0.5", "Accept-Language": "vi,en;q=0.8" },
      redirect: "follow", signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return json(502, { error: `Không tải được trang: ${e.name === "TimeoutError" ? "quá thời gian chờ" : e.message}` });
  }
  if (Number(r.headers.get("content-length") || 0) > MAX_BYTES) return json(413, { error: "Tệp quá lớn" });
  return new Response(r.body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "X-Final-Url": r.url, "Cache-Control": "no-store" },
  });
}

export const onRequest = () => json(405, { error: "Chỉ nhận POST" });
