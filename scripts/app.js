// scripts/app.js

// ---- Types / UI config ----
const TYPES = [
  { id: "wonders", label: "Wonders" },
  { id: "natural_wonders", label: "Natural Wonders" },
  { id: "leaders", label: "Leaders" },
  { id: "city_states", label: "City-States" },
  { id: "great_people", label: "Great People" },
  { id: "great_works", label: "Great Works" }
];

// What to show in the right panel attribute grid (by type)
const ATTR_DISPLAY = {
  wonders: [
    { key: "location", label: "Location" },
    { key: "era", label: "Era" },
    { key: "year", label: "Year" }
  ],
  natural_wonders: [
    { key: "terrain", label: "Terrain" },
    { key: "location", label: "Location" }
  ],
  leaders: [
    { key: "civilization", label: "Civilization" },
    { key: "birthYearLabel", label: "Birth Year" },
    { key: "deathYearLabel", label: "Death Year" },
    { key: "capital", label: "Capital" }
  ],
  city_states: [
    { key: "type", label: "Type" },
    { key: "country", label: "Country" }
  ],
  great_people: [
    { key: "era", label: "Era" },
    { key: "type", label: "Type" },
    { key: "birthYearLabel", label: "Birth Year" },
    { key: "birthPlace", label: "Birthplace" },
    { key: "deathYearLabel", label: "Death Year" },
    { key: "greatWorks", label: "Great Works" }
  ],
  great_works: [
    { key: "creator", label: "Creator" },
    { key: "era", label: "Era" },
    { key: "type", label: "Type" },
    { key: "createdYearLabel", label: "Created year" },
    { key: "creationLocation", label: "Creation location" },
    { key: "currentLocation", label: "Current location" },
    { key: "currentStatus", label: "Status" }
  ]
};

// Subtitle shown under the name in the left list cards
const CARD_SUBTITLE = {
  wonders: { field: "attrs.location" },
  natural_wonders: { field: "attrs.location" },
  leaders: { field: "attrs.civilization" },
  city_states: { field: "attrs.type" },
  great_people: { field: "attrs.type" },
  great_works: { field: "attrs.type" }
};

// Search fields (by type)
const SEARCH_FIELDS = {
  wonders: ["name", "attrs.era", "attrs.location"],
  natural_wonders: ["name", "attrs.terrain", "attrs.location"],
  leaders: ["name", "attrs.civilization", "attrs.capital"],
  city_states: ["name", "attrs.type", "attrs.country"],
  great_people: ["name", "attrs.era", "attrs.type", "attrs.birthPlace", "attrs.greatWorks"],
  great_works: ["name", "attrs.creator", "attrs.era", "attrs.type", "attrs.creationLocation", "attrs.currentLocation", "attrs.createdYearLabel"]
};

const ERA_ORDER = {
  ancient: 1,
  classical: 2,
  medieval: 3,
  renaissance: 4,
  industrial: 5,
  modern: 6,
  atomic: 7,
  information: 8
};

// Emoji counterparts to the ten Civ VI Great Person type icons.
// Display-only: sorting, searching and JSON types remain plain text.
const GREAT_PERSON_TYPE_ICONS = Object.freeze({
  "Great Admiral": "⚓",
  "Great Artist": "🎨",
  "Great Engineer": "⚙️",
  "Great General": "⚔️",
  "Great Merchant": "🪙",
  "Great Musician": "🎵",
  "Great Prophet": "✨",
  "Great Scientist": "🧪",
  "Great Writer": "✒️",
  "Comandante General": "🎖️"
});

function withGreatPersonIcon(type) {
  const label = String(type ?? "");
  const emoji = GREAT_PERSON_TYPE_ICONS[label];
  return emoji ? `${emoji} ${label}` : label;
}

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
const greatWorkMapModeEl = document.getElementById("greatWorkMapMode");
let greatWorkMapMode = "creation";

// ---- App state ----
let activeType = null;
let activeData = null;
let searchQuery = "";
let activeSortId = null;
let selectedItemId = null;

// ---- Leaflet state ----
let map = null;
let markerLayer = null;

// id -> three marker copies:
// left world, central world, right world
const markersById = new Map();

// ---- URL / Tabs ----
function getTypeFromUrl() {
  return new URLSearchParams(window.location.search).get("type");
}

function setTypeInUrl(typeId, itemId = null) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", typeId);
  if (itemId) url.searchParams.set("item", itemId);
  else url.searchParams.delete("item");
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

  const res = await fetch(path, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }

  return await res.json();
}

// ---- Great Works location mode ----
// Keep independent locations in the JSON; `coords` is the active Leaflet view.
// Existing pin clustering and selection continue to read the usual item.coords.
function applyGreatWorksCoords() {
  if (activeType !== "great_works" || !activeData?.items) return;
  const key = greatWorkMapMode === "current" ? "currentCoords" : "creationCoords";
  for (const item of activeData.items) {
    const pair = item[key];
    item.coords = Array.isArray(pair) && pair.length === 2 &&
      pair.every(n => typeof n === "number" && Number.isFinite(n))
      ? [...pair]
      : null;
  }
}

function setGreatWorkMapMode(nextMode) {
  if (activeType !== "great_works") return;
  greatWorkMapMode = nextMode === "current" ? "current" : "creation";
  if (greatWorkMapModeEl) {
    greatWorkMapModeEl.querySelectorAll("button[data-mode]").forEach(button => {
      const active = button.dataset.mode === greatWorkMapMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  applyGreatWorksCoords();
  renderMapPins();
  renderBottomTray();
  if (selectedItemId) {
    const item = activeData.items.find(it => it.id === selectedItemId);
    if (item?.coords) centerSelectedOnMap(item);
  }
}

// ---- Helpers ----
function getByPath(obj, path) {
  if (!path) return undefined;

  return path
    .split(".")
    .reduce(
      (acc, key) =>
        acc && acc[key] !== undefined
          ? acc[key]
          : undefined,
      obj
    );
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

      if (normalizeString(v).includes(q)) {
        return true;
      }
    }

    return false;
  });
}

// Compare one field; numeric years stay numeric, and missing data goes last.
// Any sorting option can declare a `then` array for secondary/tertiary sorts.
function compareSortField(a, b, criterion) {
  const av = getByPath(a, criterion.field);
  const bv = getByPath(b, criterion.field);
  const aMissing = av === undefined || av === null || av === "";
  const bMissing = bv === undefined || bv === null || bv === "";
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;

  const order = criterion.order === "desc" ? -1 : 1;
  if (criterion.field === "attrs.era") {
    const ao = ERA_ORDER[normalizeString(av).trim()] ?? 999;
    const bo = ERA_ORDER[normalizeString(bv).trim()] ?? 999;
    return order * (ao - bo);
  }
  if (typeof av === "number" && typeof bv === "number") {
    return order * (av - bv);
  }
  return order * String(av).localeCompare(String(bv));
}

function applySort(items) {
  const chosen = (activeData?.sortOptions || []).find(s => s.id === activeSortId);
  if (!chosen || chosen.id === "alpha") {
    return [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const criteria = [chosen, ...(Array.isArray(chosen.then) ? chosen.then : [])];
  return [...items].sort((a, b) => {
    for (const c of criteria) {
      const result = compareSortField(a, b, c);
      if (result !== 0) return result;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

function resolveAccent(item) {
  const key = item?.theme?.colorKey;

  return key
    ? `var(--color-${key})`
    : null;
}

function setImgWithFallback(imgEl, src) {
  const clean =
    src && String(src).trim()
      ? src
      : PLACEHOLDER_THUMB;

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

    if (
      val === undefined ||
      val === null ||
      val === ""
    ) {
      continue;
    }

    const k = document.createElement("div");
    k.className = "detailAttrKey";
    k.textContent = label;

    const v = document.createElement("div");
    v.className = "detailAttrVal";
    // Render Great Works as separate lines, while retaining the normal scalar fields.
    v.textContent = Array.isArray(val)
      ? val.map(work => `• ${work}`).join("\n")
      : (activeType === "great_people" && key === "type")
        ? withGreatPersonIcon(val)
        : String(val);
    if (Array.isArray(val)) v.style.whiteSpace = "pre-line";

    if (activeType === "great_works" && key === "creator" && item.attrs.creatorId) {
      v.textContent = "";
      const link = document.createElement("a");
      link.href = `?type=great_people&item=${encodeURIComponent(item.attrs.creatorId)}`;
      link.textContent = String(val);
      link.title = "Open this creator in Great People";
      link.addEventListener("click", event => {
        event.preventDefault();
        setTypeInUrl("great_people", item.attrs.creatorId);
        applyType("great_people", item.attrs.creatorId);
      });
      v.appendChild(link);
    }

    detailAttrsEl.appendChild(k);
    detailAttrsEl.appendChild(v);
  }
}

function renderDetail(item) {
  if (!item) return;

  const accent = resolveAccent(item);

  detailHeaderEl.style.background =
    accent ? accent : "";

  detailHeaderEl.style.color =
    accent ? "#fff" : "";

  detailTitleEl.textContent =
    item.name ?? "";

  if (activeType !== "great_works") {
    setImgWithFallback(detailThumbIngameEl, item?.thumbs?.ingame);
    setImgWithFallback(detailThumbIrlEl, item?.thumbs?.irl);
  }

  // detail.text is optional.
  const detailText = item?.detail?.text;

  if (
    detailText !== undefined &&
    detailText !== null &&
    String(detailText).trim() !== ""
  ) {
    detailTextEl.textContent = String(detailText);
    detailTextEl.style.display = "";
  } else {
    detailTextEl.textContent = "";
    detailTextEl.style.display = "none";
  }

  renderAttrs(item);

  const links =
    Array.isArray(item?.detail?.links)
      ? item.detail.links
      : [];

  detailLinksEl.innerHTML = "";

  for (const l of links) {
    if (!l?.url) continue;

    const a = document.createElement("a");

    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent =
      l.label || l.url;

    detailLinksEl.appendChild(a);
  }

  openDetail();

  // Center the selected item in the left panel.
  const selectedCard = listEl.querySelector("li.is-selected");

  if (selectedCard) {
    const listRect = listEl.getBoundingClientRect();
    const cardRect = selectedCard.getBoundingClientRect();

    const target = listEl.scrollTop
      + (cardRect.top + cardRect.height / 2)
      - (listRect.top + listRect.height / 2);

    listEl.scrollTo({
      top: target,
      behavior: "smooth"
    });
  }
}

// ---- List rendering ----
function getVisibleItems() {
  const itemsRaw =
    Array.isArray(activeData?.items)
      ? activeData.items
      : [];

  const itemsFiltered =
    applySearch(itemsRaw);

  const itemsSorted =
    applySort(itemsFiltered);

  return {
    itemsRaw,
    itemsFiltered,
    itemsSorted
  };
}

function renderSortDropdown() {
  const opts =
    activeData?.sortOptions || [];

  sortEl.innerHTML = "";

  if (opts.length === 0) {
    const o =
      document.createElement("option");

    o.value = "alpha";
    o.textContent = "A → Z";

    sortEl.appendChild(o);

    activeSortId = "alpha";
    sortEl.disabled = true;

    return;
  }

  sortEl.disabled = false;

  for (const s of opts) {
    const o =
      document.createElement("option");

    o.value = s.id;
    o.textContent = s.label;

    sortEl.appendChild(o);
  }

  const defaultSort =
    activeData?.meta?.defaultSort;

  const initial =
    opts.some(
      (x) => x.id === defaultSort
    )
      ? defaultSort
      : opts[0].id;

  activeSortId = initial;
  sortEl.value = initial;
}

// For hover only, open the copy nearest the current view.
function openBestTooltipForId(id) {
  const ms =
    markersById.get(id);

  if (
    !ms ||
    !ms.length ||
    !map
  ) {
    return;
  }

  const centerLng =
    map.getCenter().lng;

  let best = ms[0];
  let bestD = Infinity;

  for (const m of ms) {
    const d =
      Math.abs(
        m.getLatLng().lng -
        centerLng
      );

    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }

  best.openTooltip();
}

function closeAllTooltipsForId(id) {
  const ms =
    markersById.get(id);

  if (!ms) return;

  for (const m of ms) {
    m.closeTooltip();
  }
}

function renderList() {
  const title =
    activeData?.meta?.title ??
    activeType;

  const {
    itemsRaw,
    itemsSorted
  } = getVisibleItems();

  statusEl.textContent =
    `${title}: showing ${itemsSorted.length}/${itemsRaw.length}`;

  listEl.innerHTML = "";

  for (const it of itemsSorted) {
    const li =
      document.createElement("li");

    li.dataset.id = it.id;

    if (
      it.id === selectedItemId
    ) {
      li.classList.add(
        "is-selected"
      );
    }

    const accent =
      resolveAccent(it);

    if (accent) {
      li.style.borderLeft =
        `10px solid ${accent}`;
    }

    const thumbSrc =
      it?.thumbs?.ingame &&
      String(
        it.thumbs.ingame
      ).trim()
        ? it.thumbs.ingame
        : PLACEHOLDER_THUMB;

    const subCfg =
      CARD_SUBTITLE[activeType] ||
      {};

    const subVal =
      subCfg.field
        ? getByPath(
            it,
            subCfg.field
          ) ?? ""
        : "";

    const shownSubVal = activeType === "great_people"
      ? withGreatPersonIcon(subVal)
      : subVal;

    if (activeType === "great_works") {
      const card = document.createElement("div");
      card.className = "card";
      const words = document.createElement("div");
      words.className = "greatWorkCardWords";
      const heading = document.createElement("div");
      heading.className = "cardTitle";
      heading.textContent = it.name;
      const subtitle = document.createElement("div");
      subtitle.className = "cardSub";
      subtitle.textContent = String(shownSubVal);
      words.append(heading, subtitle);
      card.appendChild(words);
      li.appendChild(card);
    } else {
      li.innerHTML = `
        <div class="card">
          <img class="cardThumb" src="${thumbSrc}"
               alt="${it.name}" onerror="this.src='${PLACEHOLDER_THUMB}'">
          <div>
            <div class="cardTitle">${it.name}</div>
            <div class="cardSub">${shownSubVal}</div>
          </div>
        </div>
      `;
    }

    li.addEventListener(
      "mouseenter",
      () =>
        openBestTooltipForId(
          it.id
        )
    );

    li.addEventListener(
      "mouseleave",
      () =>
        closeAllTooltipsForId(
          it.id
        )
    );

    li.addEventListener(
      "click",
      () => {
        const same =
          selectedItemId ===
          it.id;

        if (
          same &&
          isDetailOpen()
        ) {
          closeDetail();
          return;
        }

        selectedItemId =
          it.id;

        renderList();
        renderMapPins();
        renderBottomTray();
        renderDetail(it);

        // Always move to the canonical pin
        // in the CENTRAL world.
        centerSelectedOnMap(it);
      }
    );

    listEl.appendChild(li);
  }
}

// ---- Leaflet map ----
//
// The map contains exactly three horizontal copies:
//
//   LEFT WORLD       CENTRAL WORLD       RIGHT WORLD
//   -540..-180       -180..180           180..540
//
// Every pin also gets exactly three copies:
// lng - 360, lng, lng + 360.
//
// Manual scrolling can move among the three worlds,
// but selecting any item always returns to the
// canonical pin in the CENTRAL world.

function initMapOnce() {
  if (map) return;

  const THREE_WORLD_BOUNDS =
    L.latLngBounds(
      [-85, -540],
      [85, 540]
    );

  map = L.map(
    "map",
    {
      worldCopyJump: false,
      minZoom: 2,

      // Hard limit to exactly three horizontal worlds.
      maxBounds: THREE_WORLD_BOUNDS,
      maxBoundsViscosity: 1.0
    }
  ).setView(
    [20, 0],
    2
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,

      // Keep normal longitude wrapping,
      // but maxBounds prevents scrolling
      // beyond our three copies.
      noWrap: false,

      attribution:
        "© OpenStreetMap"
    }
  ).addTo(map);

  markerLayer =
    L.layerGroup().addTo(map);
}

function resolvePinColor(item) {
  return (
    resolveAccent(item) ||
    "#444"
  );
}

function renderMapPins() {
  initMapOnce();

  markerLayer.clearLayers();
  markersById.clear();

  const {
    itemsFiltered
  } = getVisibleItems();

  for (
    const it of
    itemsFiltered
  ) {
    if (
      !Array.isArray(
        it.coords
      ) ||
      it.coords.length !== 2
    ) {
      continue;
    }

    const [lat, lng] =
      it.coords;

    if (
      typeof lat !== "number" ||
      typeof lng !== "number"
    ) {
      continue;
    }

    const color =
      resolvePinColor(it);

    const selectedClass =
      it.id === selectedItemId
        ? " is-selected"
        : "";

    const icon =
      L.divIcon({
        className: "",
        html:
          `<div class="pinDot${selectedClass}" style="background:${color}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

    const ms = [];

    // Exactly three copies:
    // left, central, right.
    for (
      const shift of
      [-360, 0, 360]
    ) {
      const m =
        L.marker(
          [
            lat,
            lng + shift
          ],
          { icon }
        ).addTo(
          markerLayer
        );

      m.bindTooltip(
        it.name,
        {
          direction: "top",
          offset: [0, -10],
          opacity: 1,
          className:
            "pinLabel"
        }
      );

      m.on(
        "mouseover",
        () =>
          m.openTooltip()
      );

      m.on(
        "mouseout",
        () =>
          m.closeTooltip()
      );

      m.on(
        "click",
        () => {
          const same =
            selectedItemId ===
            it.id;

          if (
            same &&
            isDetailOpen()
          ) {
            closeDetail();
            return;
          }

          selectedItemId =
            it.id;

          renderList();
          renderMapPins();
          renderBottomTray();
          renderDetail(it);

          // Even if the user clicked the left/right
          // copy, move to the CENTRAL copy.
          centerSelectedOnMap(it);
        }
      );

      ms.push(m);
    }

    markersById.set(
      it.id,
      ms
    );
  }
}

// Always center on the canonical CENTRAL-world copy.
//
// The dataset longitude itself is always the
// middle copy. We deliberately do NOT choose
// the wrapped longitude nearest the current view.
function centerSelectedOnMap(item) {
  if (
    !map ||
    !item ||
    !Array.isArray(item.coords) ||
    item.coords.length !== 2
  ) {
    return;
  }

  const [lat, lng] =
    item.coords;

  const zoom =
    map.getZoom();

  // Account for the right detail panel.
  //
  // We want the selected pin centered in the
  // portion of the map that is still visible.
  const panelWidth =
    isDetailOpen()
      ? detailPanelEl
          .getBoundingClientRect()
          .width
      : 0;

  const offsetX =
    panelWidth / 2;

  // IMPORTANT:
  // use lng directly, not lng ± 360.
  // This guarantees the CENTRAL map copy.
  const pinPoint =
    map.project(
      [lat, lng],
      zoom
    );

  const targetCenterPoint =
    pinPoint.add(
      [offsetX, 0]
    );

  const targetCenter =
    map.unproject(
      targetCenterPoint,
      zoom
    );

  map.panTo(
    targetCenter,
    {
      animate: true
    }
  );
}

// ---- Bottom tray ----
function renderBottomTray() {
  if (!trayPinsEl) return;

  trayPinsEl.innerHTML =
    "";

  if (!activeData) return;

  const {
    itemsSorted
  } = getVisibleItems();

  const noCoordItems =
    itemsSorted.filter(
      (it) =>
        !Array.isArray(
          it.coords
        ) ||
        it.coords.length !== 2
    );

  const trayTitle = document.querySelector("#bottomTray .trayTitle");
  if (trayTitle) {
    trayTitle.textContent = activeType === "great_works"
      ? `Without ${greatWorkMapMode === "creation" ? "creation" : "current location"} coordinates (${noCoordItems.length})`
      : "Pins without coordinates";
  }

  for (
    const it of
    noCoordItems
  ) {
    const btn =
      document.createElement(
        "button"
      );

    btn.type = "button";
    btn.className =
      "trayPin";

    btn.title = it.name;

    if (
      it.id ===
      selectedItemId
    ) {
      btn.classList.add(
        "is-selected"
      );
    }

    const accent =
      resolveAccent(it);

    if (accent) {
      btn.style.background =
        accent;
    }

    const img =
      document.createElement(
        "img"
      );

    img.alt = it.name;

    img.src =
      it?.thumbs?.ingame &&
      String(
        it.thumbs.ingame
      ).trim()
        ? it.thumbs.ingame
        : PLACEHOLDER_THUMB;

    img.onerror = () => {
      img.src =
        PLACEHOLDER_THUMB;
    };

    if (activeType === "great_works") {
      btn.classList.add("greatWorkTrayPin");
      const glyph = document.createElement("span");
      glyph.className = "greatWorkTrayGlyph";
      glyph.textContent = it.attrs?.type === "Relic" ? "✧" :
        it.attrs?.type === "Writing" ? "✎" :
        it.attrs?.type === "Music" ? "♫" : "◆";
      btn.appendChild(glyph);
    } else {
      btn.appendChild(img);
    }

    btn.addEventListener(
      "click",
      () => {
        const same =
          selectedItemId ===
          it.id;

        if (
          same &&
          isDetailOpen()
        ) {
          closeDetail();
          return;
        }

        selectedItemId =
          it.id;

        renderList();
        renderMapPins();
        renderBottomTray();
        renderDetail(it);

        if (
          Array.isArray(it.coords) &&
          it.coords.length === 2
        ) {
          centerSelectedOnMap(it);
        }
      }
    );

    trayPinsEl.appendChild(
      btn
    );
  }
}

// ---- Main flow ----
async function applyType(typeId, focusItemId = null) {
  closeDetail();

  activeType = typeId;
  greatWorkMapMode = "creation";
  document.body.classList.toggle("is-great-works", typeId === "great_works");
  if (greatWorkMapModeEl) {
    greatWorkMapModeEl.hidden = typeId !== "great_works";
    greatWorkMapModeEl.querySelectorAll("button[data-mode]").forEach(button => {
      const active = button.dataset.mode === "creation";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  renderTabs();

  selectedItemId = null;

  searchQuery = "";
  searchEl.value = "";

  statusEl.textContent =
    "Loading…";

  listEl.innerHTML = "";
  sortEl.innerHTML = "";

  try {
    activeData = await loadDataset(typeId);
    applyGreatWorksCoords();

    renderSortDropdown();
    renderList();
    renderMapPins();
    renderBottomTray();
    if (focusItemId) {
      const item = activeData.items?.find(it => it.id === focusItemId);
      if (item) {
        selectedItemId = item.id;
        renderList();
        renderMapPins();
        renderBottomTray();
        renderDetail(item);
        centerSelectedOnMap(item);
      }
    }
  } catch (err) {
    statusEl.textContent =
      `Error: ${err.message}`;

    console.error(err);
  }
}

function init() {
  if (greatWorkMapModeEl) {
    greatWorkMapModeEl.addEventListener("click", event => {
      const button = event.target.closest("button[data-mode]");
      if (button) setGreatWorkMapMode(button.dataset.mode);
    });
  }
  searchEl.addEventListener(
    "input",
    (e) => {
      searchQuery =
        e.target.value;

      renderList();
      renderMapPins();
      renderBottomTray();
    }
  );

  sortEl.addEventListener(
    "change",
    (e) => {
      activeSortId =
        e.target.value;

      renderList();
      renderMapPins();
      renderBottomTray();
    }
  );

  detailCloseEl.addEventListener(
    "click",
    closeDetail
  );

  const urlType =
    getTypeFromUrl();

  const defaultType =
    TYPES[0].id;

  const initialType =
    isValidType(urlType)
      ? urlType
      : defaultType;

  if (
    urlType !==
    initialType
  ) {
    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      "type",
      initialType
    );

    history.replaceState(
      {
        type: initialType
      },
      "",
      url
    );
  }

  applyType(initialType, new URLSearchParams(window.location.search).get("item"));

  window.addEventListener(
    "popstate",
    () => {
      const t =
        getTypeFromUrl();

      applyType(
        isValidType(t) ? t : TYPES[0].id,
        new URLSearchParams(window.location.search).get("item")
      );
    }
  );
}

init();
