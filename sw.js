// キャッシュ名 (ファイルを更新したら、このバージョンをv2, v3...と上げて反映させます)
const CACHE_NAME = 'contract-guide-v2';

// キャッシュするファイル一式
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192x192.png',
    './icon-512x512.png'
];

// インストール処理
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

// 通信処理（オフライン対応）
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュがあればそれを返す、なければ通信する
                return response || fetch(event.request);
            })
    );
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
