const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" }
];

const ATTR_DISPLAY = {
  wonders: [
    { key: "era", label: "Era" }
  ],
  leaders: [
    { key: "birthYear", label: "Birth year" }
  ],
  city_states: [
    { key: "capital", label: "Capital" }
  ]
};

const tabsEl = document.getElementById("tabs");
const statusEl = document.getElementById("statusText"); // still used as a status line for now
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const listEl = document.getElementById("cardList");
const detailPanelEl = document.getElementById("detailPanel");
const detailCloseEl = document.getElementById("detailClose");
const detailHeaderEl = document.getElementById("detailHeader");
const detailTitleEl = document.getElementById("detailTitle");
const detailThumbIngameEl = document.getElementById("detailThumbIngame");
const detailThumbIrlEl = document.getElementById("detailThumbIrl");
const detailTextEl = document.getElementById("detailText");
const detailLinksEl = document.getElementById("detailLinks");
const detailAttrsEl = document.getElementById("detailAttrs");

const PLACEHOLDER_THUMB = "assets/thumbs/placeholder.png";

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

  // Fallback: pure alphabetical
  if (!chosen || chosen.id === "alpha") {
    return [...items].sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }

  const order = chosen.order === "desc" ? -1 : 1;

  return [...items].sort((a, b) => {
    const av = getByPath(a, chosen.field);
    const bv = getByPath(b, chosen.field);

    // Undefined always last
    if (av === undefined && bv === undefined) {
      return String(a.name).localeCompare(String(b.name));
    }
    if (av === undefined) return 1;
    if (bv === undefined) return -1;

    let primary;
    if (typeof av === "number" && typeof bv === "number") {
      primary = order * (av - bv);
    } else {
      primary = order * String(av).localeCompare(String(bv));
    }

    // Tie-breaker: alphabetical by name
    if (primary !== 0) return primary;
    return String(a.name).localeCompare(String(b.name));
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

    // accent background 
	const accent = resolveAccent(it);
	if (accent) {
	  li.style.borderLeft = `10px solid ${accent}`;
	}

	// thumb: prefer in-game, fallback to placeholder
	const thumbSrc = (it?.thumbs?.ingame && it.thumbs.ingame.trim())
	  ? it.thumbs.ingame
	  : PLACEHOLDER_THUMB;

	li.innerHTML = `
	  <div class="card">
		<img class="cardThumb" src="${thumbSrc}" alt="${it.name}" onerror="this.src='${PLACEHOLDER_THUMB}'">
		<div>
		  <div class="cardTitle">${it.name}</div>
		  <div class="cardSub">${it.attrs?.era ?? ""}</div>
		</div>
	  </div>
	`;

    // click later will open right panel; for now log
	li.addEventListener("click", () => renderDetail(it));

    listEl.appendChild(li);
  }
}

function resolveAccent(item) {
  const key = item?.theme?.colorKey;
  return key ? `var(--color-${key})` : null;
}

function openDetail() {
  detailPanelEl.classList.remove("hidden");
}

function closeDetail() {
  detailPanelEl.classList.add("hidden");
}

function setImgWithFallback(imgEl, src) {
  const clean = (src && String(src).trim()) ? src : PLACEHOLDER_THUMB;
  imgEl.src = clean;
  imgEl.onerror = () => { imgEl.src = PLACEHOLDER_THUMB; };
}

function renderAttrs(item) {
  detailAttrsEl.innerHTML = "";

  const cfg = ATTR_DISPLAY[activeType];
  if (!cfg || !item?.attrs) return;

  for (const { key, label } of cfg) {
    const val = item.attrs[key];
    if (val === undefined || val === null || val === "") continue;

    const k = document.createElement("div");
    k.className = "detailAttrKey";
    k.textContent = label;

    const v = document.createElement("div");
    v.className = "detailAttrVal";
    v.textContent = String(val);

    detailAttrsEl.appendChild(k);
    detailAttrsEl.appendChild(v);
  }
}

function renderDetail(item) {
  if (!item) return;

  // Accent header background (optional but nice)
  const accent = resolveAccent(item);
  detailHeaderEl.style.background = accent ? accent : "";
  detailHeaderEl.style.color = accent ? "#fff" : "";

  detailTitleEl.textContent = item.name ?? "";

  setImgWithFallback(detailThumbIngameEl, item?.thumbs?.ingame);
  setImgWithFallback(detailThumbIrlEl, item?.thumbs?.irl); // you chose `irl`

  // Text (simple for now; preserves newlines)
  const text = item?.detail?.text ?? "";
  detailTextEl.textContent = text;

  renderAttrs(item);

  // Links
  const links = Array.isArray(item?.detail?.links) ? item.detail.links : [];
  detailLinksEl.innerHTML = "";
  for (const l of links) {
    if (!l?.url) continue;
    const a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = l.label || l.url;
    detailLinksEl.appendChild(a);
  }

  openDetail();
}

// --- main applyType ---

async function applyType(typeId) {
  closeDetail();
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

  detailCloseEl.addEventListener("click", closeDetail);

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

