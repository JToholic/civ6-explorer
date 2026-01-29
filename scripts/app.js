const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" }
];

const tabsEl = document.getElementById("tabs");
const statusEl = document.getElementById("statusText"); // still used as a status line for now
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const listEl = document.getElementById("cardList");

let activeType = null;
let activeData = null;
let searchQuery = "";
let activeSortId = null;

function getTypeFromUrl() {
  return new URLSearchParams(window.location.search).get("type");
}

function setTypeInUrl(typeId) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", typeId);
  history.pushState({ type: typeId }, "", url);
}

function isValidType(typeId) {
  return TYPES.some(t => t.id === typeId);
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

async function loadDataset(typeId) {
  const path = `datasets/${typeId}.json`;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return await res.json();
}

// --- list rendering helpers ---

function getByPath(obj, path) {
  // supports "name" and "attrs.era"
  if (!path) return undefined;
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function normalizeString(s) {
  return String(s ?? "").toLowerCase();
}

function applySearch(items) {
  const q = normalizeString(searchQuery).trim();
  if (!q) return items;
  return items.filter(it => normalizeString(it.name).includes(q));
}

function applySort(items) {
  const sortOptions = activeData?.sortOptions || [];
  const chosen = sortOptions.find(s => s.id === activeSortId);

  if (!chosen) {
    // fallback: alpha by name
    return [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const order = chosen.order === "desc" ? -1 : 1;

  return [...items].sort((a, b) => {
    const av = getByPath(a, chosen.field);
    const bv = getByPath(b, chosen.field);

    // undefined goes last
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;

    // numeric vs string compare
    if (typeof av === "number" && typeof bv === "number") {
      return order * (av - bv);
    }
    return order * String(av).localeCompare(String(bv));
  });
}

function renderSortDropdown() {
  const opts = activeData?.sortOptions || [];
  sortEl.innerHTML = "";

  if (opts.length === 0) {
    const o = document.createElement("option");
    o.value = "alpha";
    o.textContent = "A → Z";
    sortEl.appendChild(o);
    activeSortId = "alpha";
    sortEl.disabled = true;
    return;
  }

  sortEl.disabled = false;
  for (const s of opts) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.label;
    sortEl.appendChild(o);
  }

  const defaultSort = activeData?.meta?.defaultSort;
  const initial = (opts.some(x => x.id === defaultSort) ? defaultSort : opts[0].id);
  activeSortId = initial;
  sortEl.value = initial;
}

function renderList() {
  const title = activeData?.meta?.title ?? activeType;
  const itemsRaw = Array.isArray(activeData?.items) ? activeData.items : [];

  const itemsFiltered = applySearch(itemsRaw);
  const itemsSorted = applySort(itemsFiltered);

  statusEl.textContent = `${title}: showing ${itemsSorted.length}/${itemsRaw.length}`;

  listEl.innerHTML = "";
  for (const it of itemsSorted) {
    const li = document.createElement("li");

    // accent background (light touch for now)
    const accent = it?.theme?.accent;
    if (accent) {
      li.style.borderLeft = `10px solid ${accent}`;
    }

    // simple card content for now (thumbs later)
    li.innerHTML = `
      <div style="font-weight:600">${it.name}</div>
      <div class="small">${it.attrs?.era ?? ""}</div>
    `;

    // click later will open right panel; for now log
    li.addEventListener("click", () => console.log("Clicked item:", it.id));

    listEl.appendChild(li);
  }
}

// --- main applyType ---

async function applyType(typeId) {
  activeType = typeId;
  renderTabs();

  // reset search UI per type (keeps things predictable)
  searchQuery = "";
  searchEl.value = "";

  statusEl.textContent = "Loading…";
  listEl.innerHTML = "";
  sortEl.innerHTML = "";

  try {
    activeData = await loadDataset(typeId);
    renderSortDropdown();
    renderList();
    console.log("Loaded dataset:", typeId, activeData);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

function init() {
  // search input
  searchEl.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  // sort selection
  sortEl.addEventListener("change", (e) => {
    activeSortId = e.target.value;
    renderList();
  });

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

