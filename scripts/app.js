// URL-driven tab switching (no dataset loading yet)

const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" }
];

const tabsEl = document.getElementById("tabs");

function getTypeFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return p.get("type");
}

function setTypeInUrl(typeId) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", typeId);
  history.pushState({ type: typeId }, "", url);
}

function renderTabs(activeType) {
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

function applyType(typeId) {
  renderTabs(typeId);

  // Placeholder hook points for next steps:
  // - load dataset based on typeId
  // - render left list
  // - render map pins + bottom tray pins
  console.log("Active type:", typeId);
}

function init() {
  const urlType = getTypeFromUrl();
  const defaultType = TYPES[0].id;
  const initialType = TYPES.some(t => t.id === urlType) ? urlType : defaultType;

  // Ensure URL always has a valid type (nice for sharing)
  if (urlType !== initialType) {
    const url = new URL(window.location.href);
    url.searchParams.set("type", initialType);
    history.replaceState({ type: initialType }, "", url);
  }

  applyType(initialType);

  // Back/forward navigation
  window.addEventListener("popstate", () => {
    const t = getTypeFromUrl();
    const safeType = TYPES.some(x => x.id === t) ? t : TYPES[0].id;
    applyType(safeType);
  });
}

init();

