// scripts/pin_clusters.js
// A small extension to the existing map: cluster only pins that overlap on
// screen, unclustering as the map zooms in. Identical coordinates spiderfy.
// Each of the app's three world copies has its OWN cluster group.
// Load after Leaflet.markercluster and scripts/app.js (classic scripts).

(() => {
  "use strict";

  if (typeof L === "undefined" || typeof L.markerClusterGroup !== "function") {
    console.error("Pin clustering requires Leaflet.markercluster 1.5.3.");
    return;
  }

  const WORLD_SHIFTS = [-360, 0, 360];
  const CLUSTER_RADIUS_PX = 10;
  const MAX_TOOLTIP_NAMES = 10;

  // Re-created on every map render, like the existing markerLayer.
  const groupsByShift = new Map();

  function createClusterIcon(cluster) {
    const hasSelection = cluster.getAllChildMarkers().some(
      (marker) => marker._civItemId === selectedItemId
    );
    return L.divIcon({
      className: "pinClusterIcon",
      html: `<div class="pinCluster${hasSelection ? " is-selected" : ""}">${cluster.getChildCount()}</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  }

  function clusterMembers(cluster) {
    return cluster.getAllChildMarkers();
  }

  function sameCoordinates(markers) {
    if (markers.length < 2) return false;
    const first = markers[0].getLatLng();
    return markers.every((marker) => {
      const current = marker.getLatLng();
      return Math.abs(current.lat - first.lat) < 1e-9 &&
        Math.abs(current.lng - first.lng) < 1e-9;
    });
  }

  function makeClusterTooltip(cluster) {
    const names = clusterMembers(cluster)
      .map((marker) => marker._civItemName)
      .sort((a, b) => a.localeCompare(b));

    const content = document.createElement("div");
    content.className = "pinClusterTooltipContent";

    const count = document.createElement("div");
    count.className = "pinClusterTooltipCount";
    count.textContent = `${names.length} items`;
    content.appendChild(count);

    for (const name of names.slice(0, MAX_TOOLTIP_NAMES)) {
      const line = document.createElement("div");
      line.className = "pinClusterTooltipName";
      line.textContent = name; // textContent prevents item names from being HTML.
      content.appendChild(line);
    }

    if (names.length > MAX_TOOLTIP_NAMES) {
      const rest = document.createElement("div");
      rest.className = "pinClusterTooltipMore";
      rest.textContent = `+${names.length - MAX_TOOLTIP_NAMES} more`;
      content.appendChild(rest);
    }

    return content;
  }

  function showClusterTooltip(cluster) {
    if (!cluster) return;
    // Cluster objects may be re-used as zoom changes. Refresh the member list.
    cluster.unbindTooltip();
    cluster.bindTooltip(makeClusterTooltip(cluster), {
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      className: "pinClusterLabel"
    });
    cluster.openTooltip();
  }

  function makeClusterGroup() {
    const group = L.markerClusterGroup({
      maxClusterRadius: CLUSTER_RADIUS_PX,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      spiderfyDistanceMultiplier: 1.4,
      iconCreateFunction: createClusterIcon
    });

    group.on("clustermouseover", ({ layer }) => showClusterTooltip(layer));
    group.on("clustermouseout", ({ layer }) => layer.closeTooltip());
    group.on("clusterclick", ({ layer }) => {
      layer.closeTooltip();
      const markers = clusterMembers(layer);
      const maxZoom = map.getMaxZoom();

      if (sameCoordinates(markers) || (Number.isFinite(maxZoom) && map.getZoom() >= maxZoom)) {
        // Zoom cannot separate co-located pins; spread them around the point.
        layer.spiderfy();
      } else {
        // Geographically distinct pins will separate naturally as zoom increases.
        layer.zoomToBounds();
      }
    });
    return group;
  }

  function visibleParent(marker) {
    return marker?._civClusterGroup?.getVisibleParent(marker) || null;
  }

  function closestMarkerToView(id) {
    const markers = markersById.get(id);
    if (!map || !markers?.length) return null;
    const currentLongitude = map.getCenter().lng;
    return markers.reduce((closest, marker) =>
      Math.abs(marker.getLatLng().lng - currentLongitude) <
      Math.abs(closest.getLatLng().lng - currentLongitude)
        ? marker
        : closest
    );
  }

  // Override only the three pin-related functions from scripts/app.js.
  // Other behaviors (selection, sorting, map centering, detail panel) stay intact.
  renderMapPins = function renderClusteredMapPins() {
    initMapOnce();
    markerLayer.clearLayers();
    markersById.clear();
    groupsByShift.clear();

    for (const shift of WORLD_SHIFTS) {
      const group = makeClusterGroup();
      groupsByShift.set(shift, group);
      markerLayer.addLayer(group);
    }

    const { itemsFiltered } = getVisibleItems();
    for (const item of itemsFiltered) {
      if (!Array.isArray(item.coords) || item.coords.length !== 2) continue;
      const [lat, lng] = item.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const color = resolvePinColor(item);
      const selected = item.id === selectedItemId ? " is-selected" : "";
      const icon = L.divIcon({
        className: "",
        html: `<div class="pinDot${selected}" style="background:${color}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const markers = [];
      for (const shift of WORLD_SHIFTS) {
        const group = groupsByShift.get(shift);
        const marker = L.marker([lat, lng + shift], { icon });
        marker._civItemId = item.id;
        marker._civItemName = String(item.name ?? "");
        marker._civClusterGroup = group;

        marker.bindTooltip(marker._civItemName, {
          direction: "top",
          offset: [0, -10],
          opacity: 1,
          className: "pinLabel"
        });

        marker.on("click", () => {
          const same = selectedItemId === item.id;
          if (same && isDetailOpen()) {
            closeDetail();
            return;
          }

          selectedItemId = item.id;
          renderList();
          renderMapPins();
          renderBottomTray();
          renderDetail(item);
          // Keep the app's existing central-world, panel-aware centering.
          centerSelectedOnMap(item);
        });

        group.addLayer(marker);
        markers.push(marker);
      }
      markersById.set(item.id, markers);
    }
  };

  openBestTooltipForId = function openClusterAwareTooltip(id) {
    const marker = closestMarkerToView(id);
    const parent = visibleParent(marker);
    if (!parent) return;
    if (parent === marker) {
      marker.openTooltip();
    } else {
      showClusterTooltip(parent);
    }
  };

  closeAllTooltipsForId = function closeClusterAwareTooltips(id) {
    const markers = markersById.get(id) || [];
    for (const marker of markers) {
      marker.closeTooltip();
      const parent = visibleParent(marker);
      if (parent && parent !== marker) parent.closeTooltip();
    }
  };
})();
