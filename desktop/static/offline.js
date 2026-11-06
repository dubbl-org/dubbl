// Shown when the server can't be loaded. Retries on its own every few seconds
// and as soon as the network comes back.
const api = window.dubblConnect;
const failed = new URLSearchParams(location.search).get("url");
if (failed) {
  try {
    document.getElementById("detail").textContent = `${new URL(failed).host} isn't answering. We'll keep trying.`;
  } catch {}
}

document.getElementById("retry").addEventListener("click", () => api.retry());
document.getElementById("change").addEventListener("click", () => api.change());
window.addEventListener("online", () => api.retry());
setInterval(() => {
  if (navigator.onLine) api.retry();
}, 15000);
