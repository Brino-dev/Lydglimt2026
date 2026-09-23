const CACHE_NAME = "lydglimt-v8";

const CORE_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./lydglimt-mikro-fade03.mp3",
  "./lydglimt-full-fade03.mp3",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleFetch(request, url));
});

function handleFetch(request, url) {
  if (request.mode === "navigate") {
    return fetch(request).then(function (response) {
      return cacheCopy(request, response);
    }).catch(function () {
      return caches.match("./index.html");
    });
  }

  if (request.headers.has("range") || /\.mp3$/i.test(url.pathname)) {
    return respondToMedia(request);
  }

  return caches.match(request, { ignoreSearch: true }).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      return cacheCopy(request, response);
    });
  });
}

function cacheCopy(request, response) {
  if (response && response.ok) {
    var copy = response.clone();
    caches.open(CACHE_NAME).then(function (cache) {
      cache.put(request, copy);
    });
  }
  return response;
}

function respondToMedia(request) {
  var key = "./" + new URL(request.url).pathname.split("/").pop();

  return caches.match(request, { ignoreSearch: true }).then(function (cached) {
    return cached || caches.match(key, { ignoreSearch: true });
  }).then(function (cached) {
    if (!cached) {
      return fetch(request).then(function (response) {
        return cacheCopy(key, response);
      });
    }
    if (!request.headers.has("range")) return cached;
    return cached.arrayBuffer().then(function (buffer) {
      return rangeResponse(request, buffer, cached.headers.get("Content-Type") || "audio/mpeg");
    });
  }).catch(function () {
    return fetch(request);
  });
}

function rangeResponse(request, buffer, contentType) {
  var size = buffer.byteLength;
  var match = String(request.headers.get("range") || "").match(/bytes=(\d*)-(\d*)/);
  var start = 0;
  var end = size - 1;

  if (match) {
    if (match[1] !== "") start = Number(match[1]);
    if (match[2] !== "") end = Number(match[2]);
  }

  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  if (start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + size }
    });
  }

  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(end - start + 1),
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
      "Accept-Ranges": "bytes"
    }
  });
}
