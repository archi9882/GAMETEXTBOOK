// Register the service worker that keeps the site playable offline (M1 design 3.7).
// sw.js only exists in the built site (tools/build-site.mjs); during development registration simply fails.
// Service workers need https, or localhost when testing the built site
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: new URL("../", import.meta.url).pathname })
    .catch((e) => console.info("Offline support is not available here:", e.message));
}
