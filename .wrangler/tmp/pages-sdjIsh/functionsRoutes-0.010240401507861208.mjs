import { onRequestPost as __api_order_webhook_js_onRequestPost } from "/home/claude/luna-cosmetics/functions/api/order-webhook.js"
import { onRequestPost as __api_rebuild_js_onRequestPost } from "/home/claude/luna-cosmetics/functions/api/rebuild.js"
import { onRequest as __api_order_webhook_js_onRequest } from "/home/claude/luna-cosmetics/functions/api/order-webhook.js"
import { onRequest as __api_rebuild_js_onRequest } from "/home/claude/luna-cosmetics/functions/api/rebuild.js"

export const routes = [
    {
      routePath: "/api/order-webhook",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_order_webhook_js_onRequestPost],
    },
  {
      routePath: "/api/rebuild",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_rebuild_js_onRequestPost],
    },
  {
      routePath: "/api/order-webhook",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_order_webhook_js_onRequest],
    },
  {
      routePath: "/api/rebuild",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_rebuild_js_onRequest],
    },
  ]