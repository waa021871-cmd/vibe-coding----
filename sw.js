// ===== 积分系统 PWA · Service Worker =====
// 版本号 — 更新 SW 时改这里，旧缓存自动清除
const CACHE_VERSION = "v1";
const CACHE_NAME = "points-app-" + CACHE_VERSION;

// 首次安装时预缓存核心文件
const PRE_CACHE = [
  "/vibe-coding----/",
  "/vibe-coding----/index.html",
  "/vibe-coding----/manifest.json",
  "/vibe-coding----/icon-192.png",
  "/vibe-coding----/icon-512.png",
];

// CDN 资源（缓存后可离线使用）
const CDN_CACHE = [
  "cdn.jsdelivr.net",   // html2canvas + supabase SDK
  "fonts.googleapis.com", // Google Fonts CSS
  "fonts.gstatic.com",    // Google Fonts 字体文件
];

// ========== 安装：预缓存核心文件 ==========
self.addEventListener("install", (event) => {
  console.log("📦 [PWA] 正在安装 v1...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRE_CACHE).catch((err) => {
        // 单个文件失败不影响安装
        console.warn("⚠️ [PWA] 预缓存部分失败：", err.message);
      });
    })
  );
  // 立即激活，不等待旧 SW 关闭
  self.skipWaiting();
});

// ========== 激活：清理旧版本缓存 ==========
self.addEventListener("activate", (event) => {
  console.log("✅ [PWA] 已激活 v1");
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("🗑️ [PWA] 清理旧缓存：", key);
            return caches.delete(key);
          })
      );
    })
  );
  // 立即接管所有页面
  self.clients.claim();
});

// ========== 请求拦截：智能缓存策略 ==========
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Supabase API 请求 → 始终走网络，不缓存
  if (url.hostname.includes("supabase.co")) {
    return; // 不拦截
  }

  // 2. CDN 资源 → 缓存优先，后台更新
  if (CDN_CACHE.some((domain) => url.hostname.includes(domain))) {
    event.respondWith(cacheFirstWithRefresh(event.request));
    return;
  }

  // 3. 自己页面的导航请求（HTML） → 网络优先，离线时用缓存
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // 4. 其他同域资源（图标、manifest 等） → 缓存优先
  if (url.hostname === location.hostname) {
    event.respondWith(cacheFirstWithRefresh(event.request));
    return;
  }

  // 5. 其他请求 → 不拦截
});

// ========== 策略函数 ==========

// 缓存优先 + 后台更新（适合 CDN 和静态资源）
async function cacheFirstWithRefresh(request) {
  const cached = await caches.match(request);
  // 后台发起网络请求更新缓存（不阻塞响应）
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => {});
  // 立即返回缓存；没有缓存则等网络
  return cached || (await fetchPromise);
}

// 网络优先 + 缓存兜底（适合 HTML 页面，保证最新内容）
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // 更新缓存
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 离线 → 用缓存
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
