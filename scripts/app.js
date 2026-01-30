// scripts/app.js

// ---- Types / UI config ----
const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" }
];

// What to show in the right panel attribute grid (by type)
const ATTR_DISPLAY = {
  wonders: [
	  { key: "location", label: "Location" },
	  { key: "era", label: "Era" },
	  { key: "year", label: "Year" }
  ],
  natural_wonders: [
    { key: "nTiles", label: "# of Tiles" },
    { key: "passability", label: "Passability" },
    { key: "terrain", label: "Terrain" }
  ],
  leaders: [
    { key: "civilization", label: "Civilization" },
    { key: "birthYear", label: "Birth Year" }
  ],
  city_states: [{ key: "type", label: "Type" }]
};

// Subtitle shown under the name in the left list cards
const CARD_SUBTITLE = {
  wonders: { field: "attrs.location" },
  natural_wonders: { field: "attrs.terrain" },
  leaders: { field: "attrs.civilization" },
  city_states: { field: "attrs.type" }
};

// Search fields (by type)
const SEARCH_FIELDS = {
  wonders: ["name", "attrs.era"],
  natural_wonders: ["name", "attrs.passability", "attrs.terrain"],
  leaders: ["name", "attrs.civilization"],
  city_states: ["name", "attrs.type"]
};

const PLACEHOLDER_THUMB = "assets/thumbs/placeholder.png";

// ---- DOM ----
const tabsEl = document.getElementById("tabs");
const statusEl = document.getElementById("statusText");
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
const trayPinsEl = document.querySelector("#bottomTray .trayPins");

// ---- App state ----
let activeType = null;
let activeData = null;
let searchQuery = "";
let activeSortId = null;
let selectedItemId = null;

// ---- Leaflet state ----
let map = null;
let markerLayer = null;
// id -> array of 3 markers (lng-360, lng, lng+360)
const markersById = new Map();

// ---- URL / Tabs ----
function getTypeFromUrl() {
  return new URLSearchParams(window.location.search).get("type");
}

function setTypeInUrl(typeId) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", typeId);
  history.pushState({ type: typeId }, "", url);
}

function isValidType(typeId) {
  return TYPES.some((t) => t.id === typeId);
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

// ---- Data loading ----
async function loadDataset(typeId) {
  const path = `datasets/${typeId}.json`;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return await res.json();
}

// ---- Helpers ----
function getByPath(obj, path) {
  if (!path) return undefined;
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function normalizeString(s) {
  return String(s ?? "").toLowerCase();
}

function applySearch(items) {
  const q = normalizeString(searchQuery).trim();
  if (!q) return items;

  const fields = SEARCH_FIELDS[activeType] || ["name"];
  return items.filter((it) => {
    for (const field of fields) {
      const v = getByPath(it, field);
      if (v === undefined || v === null) continue;
      if (normalizeString(v).includes(q)) return true;
    }
    return false;
  });
}

function applySort(items) {
  const sortOptions = activeData?.sortOptions || [];
  const chosen = sortOptions.find((s) => s.id === activeSortId);

  // Fallback: pure alpha
  if (!chosen || chosen.id === "alpha") {
    return [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const order = chosen.order === "desc" ? -1 : 1;

  return [...items].sort((a, b) => {
    const av = getByPath(a, chosen.field);
    const bv = getByPath(b, chosen.field);

    // undefined last
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

    if (primary !== 0) return primary;
    return String(a.name).localeCompare(String(b.name)); // tie-break alpha
  });
}

function resolveAccent(item) {
  const key = item?.theme?.colorKey;
  return key ? `var(--color-${key})` : null;
}

function setImgWithFallback(imgEl, src) {
  const clean = src && String(src).trim() ? src : PLACEHOLDER_THUMB;
  imgEl.src = clean;
  imgEl.onerror = () => {
    imgEl.src = PLACEHOLDER_THUMB;
  };
}

// ---- Right panel ----
function isDetailOpen() {
  return !detailPanelEl.classList.contains("hidden");
}

function openDetail() {
  detailPanelEl.classList.remove("hidden");
}

function closeDetail() {
  detailPanelEl.classList.add("hidden");
  selectedItemId = null;
  if (activeData) {
	renderList();
	renderMapPins();
	renderBottomTray();
  }
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

  const accent = resolveAccent(item);
  detailHeaderEl.style.background = accent ? accent : "";
  detailHeaderEl.style.color = accent ? "#fff" : "";

  detailTitleEl.textContent = item.name ?? "";

  setImgWithFallback(detailThumbIngameEl, item?.thumbs?.ingame);
  setImgWithFallback(detailThumbIrlEl, item?.thumbs?.irl);

  detailTextEl.textContent = item?.detail?.text ?? "";
  renderAttrs(item);

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

// ---- List rendering ----
function getVisibleItems() {
  const itemsRaw = Array.isArray(activeData?.items) ? activeData.items : [];
  const itemsFiltered = applySearch(itemsRaw);
  const itemsSorted = applySort(itemsFiltered);
  return { itemsRaw, itemsFiltered, itemsSorted };
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
  const initial = opts.some((x) => x.id === defaultSort) ? defaultSort : opts[0].id;
  activeSortId = initial;
  sortEl.value = initial;
}

function openBestTooltipForId(id) {
  const ms = markersById.get(id);
  if (!ms || !ms.length || !map) return;

  const centerLng = map.getCenter().lng;
  let best = ms[0];
  let bestD = Infinity;

  for (const m of ms) {
    const d = Math.abs(m.getLatLng().lng - centerLng);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  best.openTooltip();
}

function closeAllTooltipsForId(id) {
  const ms = markersById.get(id);
  if (!ms) return;
  for (const m of ms) m.closeTooltip();
}

function renderList() {
  const title = activeData?.meta?.title ?? activeType;
  const { itemsRaw, itemsSorted } = getVisibleItems();

  statusEl.textContent = `${title}: showing ${itemsSorted.length}/${itemsRaw.length}`;

  listEl.innerHTML = "";
  for (const it of itemsSorted) {
    const li = document.createElement("li");
	li.dataset.id = it.id;
    if (it.id === selectedItemId) li.classList.add("is-selected");

    const accent = resolveAccent(it);
    if (accent) li.style.borderLeft = `10px solid ${accent}`;

    const thumbSrc =
      it?.thumbs?.ingame && String(it.thumbs.ingame).trim()
        ? it.thumbs.ingame
        : PLACEHOLDER_THUMB;

    const subCfg = CARD_SUBTITLE[activeType] || {};
    const subVal = subCfg.field ? getByPath(it, subCfg.field) ?? "" : "";

    li.innerHTML = `
      <div class="card">
        <img class="cardThumb" src="${thumbSrc}" alt="${it.name}"
             onerror="this.src='${PLACEHOLDER_THUMB}'">
        <div>
          <div class="cardTitle">${it.name}</div>
          <div class="cardSub">${subVal}</div>
        </div>
      </div>
    `;

    li.addEventListener("mouseenter", () => openBestTooltipForId(it.id));
    li.addEventListener("mouseleave", () => closeAllTooltipsForId(it.id));

    li.addEventListener("click", () => {
      const same = selectedItemId === it.id;
      if (same && isDetailOpen()) {
        closeDetail();
        return;
      }
      selectedItemId = it.id;
      renderList();
	  renderMapPins();
	  renderBottomTray();
      renderDetail(it);
    });

    listEl.appendChild(li);
  }
}

// ---- Leaflet map + stable wrapped pins ----
function initMapOnce() {
  if (map) return;

  map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

function resolvePinColor(item) {
  return resolveAccent(item) || "#444";
}

function renderMapPins() {
  initMapOnce();

  markerLayer.clearLayers();
  markersById.clear();

  const { itemsFiltered } = getVisibleItems();

  for (const it of itemsFiltered) {
    if (!Array.isArray(it.coords) || it.coords.length !== 2) continue;

    const [lat, lng] = it.coords;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const color = resolvePinColor(it);

	const selectedClass = (it.id === selectedItemId) ? " is-selected" : "";
    const icon = L.divIcon({
      className: "",
	  html: `<div class="pinDot${selectedClass}" style="background:${color}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const ms = [];
    for (const shift of [-360, 0, 360]) {
      const m = L.marker([lat, lng + shift], { icon }).addTo(markerLayer);

      m.bindTooltip(it.name, {
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        className: "pinLabel"
      });

      m.on("mouseover", () => m.openTooltip());
      m.on("mouseout", () => m.closeTooltip());

      m.on("click", () => {
        const same = selectedItemId === it.id;
        if (same && isDetailOpen()) {
          closeDetail();
          return;
        }
        selectedItemId = it.id;
        renderList();
        renderMapPins();
        renderDetail(it);
      });

      ms.push(m);
    }

    markersById.set(it.id, ms);
  }
}

// ---- Bottom tray ----
function renderBottomTray() {
  if (!trayPinsEl) return;
  trayPinsEl.innerHTML = "";

  if (!activeData) return;

  const { itemsSorted } = getVisibleItems();
  const noCoordItems = itemsSorted.filter(
    it => !Array.isArray(it.coords) || it.coords.length !== 2
  );

  for (const it of noCoordItems) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "trayPin";
    btn.title = it.name;

    if (it.id === selectedItemId) btn.classList.add("is-selected");

    const accent = resolveAccent(it);
    if (accent) btn.style.background = accent;

    const img = document.createElement("img");
    img.alt = it.name;
    img.src = (it?.thumbs?.ingame && String(it.thumbs.ingame).trim()) ? it.thumbs.ingame : PLACEHOLDER_THUMB;
    img.onerror = () => { img.src = PLACEHOLDER_THUMB; };

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      const same = (selectedItemId === it.id);

      if (same && isDetailOpen()) {
        closeDetail(); // your closeDetail clears selection + re-renders
        return;
      }

      selectedItemId = it.id;
      renderList();
      renderMapPins();
      renderBottomTray();
      renderDetail(it);
    });

    trayPinsEl.appendChild(btn);
  }
}

// ---- Main flow ----
async function applyType(typeId) {
  closeDetail();

  activeType = typeId;
  renderTabs();

  selectedItemId = null;

  searchQuery = "";
  searchEl.value = "";

  statusEl.textContent = "Loading…";
  listEl.innerHTML = "";
  sortEl.innerHTML = "";

  try {
    activeData = await loadDataset(typeId);
    renderSortDropdown();
    renderList();
    renderMapPins();
	renderBottomTray();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

function init() {
  searchEl.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderList();
    renderMapPins();
	renderBottomTray();
  });

  sortEl.addEventListener("change", (e) => {
    activeSortId = e.target.value;
    renderList();
    renderMapPins();
	renderBottomTray();
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

