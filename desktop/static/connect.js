// First-run (and "Change Server…") screen: pick dubbl Cloud or a self-hosted origin.
const api = window.dubblConnect;
const form = document.getElementById("form");
const urlInput = document.getElementById("url");
const selfHosted = document.getElementById("self-hosted");
const submit = document.getElementById("submit");
const error = document.getElementById("error");
const options = [...document.querySelectorAll(".option")];

let choice = "cloud";
let cloudUrl = "https://dubbl.dev";

function select(next) {
  choice = next;
  for (const option of options) option.setAttribute("aria-pressed", String(option.dataset.choice === next));
  selfHosted.classList.toggle("open", next === "self");
  if (next === "self") setTimeout(() => urlInput.focus(), 120);
  error.textContent = "";
}

for (const option of options) option.addEventListener("click", () => select(option.dataset.choice));

api.current().then((state) => {
  if (!state) return;
  cloudUrl = state.cloudUrl;
  document.getElementById("cloud-host").textContent = new URL(cloudUrl).host;
  if (state.serverUrl && state.serverUrl !== cloudUrl) {
    urlInput.value = state.serverUrl;
    select("self");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = choice === "cloud" ? cloudUrl : urlInput.value;
  if (!target.trim()) {
    error.textContent = "Enter your server's address.";
    return;
  }
  submit.disabled = true;
  submit.textContent = "Connecting…";
  error.textContent = "";
  const result = await api.connect(target);
  if (!result.ok) {
    error.textContent = result.error;
    submit.disabled = false;
    submit.textContent = "Continue";
  }
});
