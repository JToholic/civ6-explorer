const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" }
];

const tabsEl = document.getElementById("tabs");
const statusEl = document.getElementById("statusText");

let activeType = null;
let activeData = null;

function getTypeFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return p.get("type");
}

function setTypeInUrl(typeId) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", typeId);
  history.pushState({ type: typeId }, "", url);
}

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const t of TYPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (t.id === activeType ? " is-active" : "");
    btn.textContent = t.label;

    btn.addEventListener("click", () => {
      if (t.id === activeType) return;
      setTypeInUrl(t.id);
      applyType(t.id);
    });

    tabsEl.appendChild(btn);
  }
}

function isValidType(typeId) {
  return TYPES.some(t => t.id === typeId);
}

async function loadDataset(typeId) {
  const path = `datasets/${typeId}.json`;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  const data = await res.json();
  return data;
}

function updateStatusFromData() {
  const title = activeData?.meta?.title ?? activeType;
  const n = Array.isArray(activeData?.items) ? activeData.items.length : 0;
  statusEl.textContent = `${title}: loaded ${n} item(s)`;
}

async function applyType(typeId) {
  activeType = typeId;
  renderTabs();

  statusEl.textContent = "Loading…";
  activeData = null;

  try {
    activeData = await loadDataset(typeId);
    updateStatusFromData();
    console.log("Loaded dataset:", typeId, activeData);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

function init() {
  const urlType = getTypeFromUrl();
  const defaultType = TYPES[0].id;
  const initialType = isValidType(urlType) ? urlType : defaultType;

  if (urlType !== initialType) {
    const url = new URL(window.location.href);
    url.searchParams.set("type", initialType);
    history.replaceState({ type: initialType }, "", url);
  }

  applyType(initialType);

  window.addEventListener("popstate", () => {
    const t = getTypeFromUrl();
    applyType(isValidType(t) ? t : TYPES[0].id);
  });
}

init();

