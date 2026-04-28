const zones = [
  {
    name: "Av. 25 de Mayo oeste / Santiago Plaul",
    center: [-34.7016, -58.4162],
    radius: 720,
    color: "#0f766e",
    text: "Zona equilibrada: alquileres razonables, barrio denso y menor presion de competidores directos. Buen encaje para retail + reposicion."
  },
  {
    name: "Lanusita / centro oeste",
    center: [-34.7054, -58.3962],
    radius: 620,
    color: "#b45309",
    text: "Alta circulacion y mejor vidriera, pero competencia directa concentrada. Conviene solo con local muy visible o propuesta diferencial."
  },
  {
    name: "Remedios de Escalada / norte",
    center: [-34.6896, -58.3955],
    radius: 760,
    color: "#b91c1c",
    text: "Buen transito de avenida, con competidores cercanos y alquileres que pueden saltar fuerte. Priorizar esquina y carga/descarga."
  },
  {
    name: "San Martin / oeste",
    center: [-34.7048, -58.4160],
    radius: 660,
    color: "#0f5f8c",
    text: "Perfil barrial/mixto; buena logica para clientes que compran bidones, sueltos e insumos de uso frecuente."
  }
];

const map = L.map("map", { scrollWheelZoom: true }).setView([-34.6998, -58.4048], 14);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri &mdash; data from OpenStreetMap contributors and other providers"
}).addTo(map);

const candidateLayer = L.layerGroup().addTo(map);
const directLayer = L.layerGroup().addTo(map);
const indirectLayer = L.layerGroup().addTo(map);
const ringLayer = L.layerGroup().addTo(map);
const zoneLayer = L.layerGroup().addTo(map);

let places = { candidates: [], competitors: [] };
let selectedCandidateId = null;
const candidateMarkers = new Map();

const icons = {
  candidate: shopIcon("shop-marker", [34, 34], [17, 34]),
  candidateSelected: shopIcon("shop-marker-selected", [42, 42], [21, 42]),
  direct: icon("direct"),
  indirect: icon("indirect"),
  inactive: icon("inactive")
};

function icon(kind) {
  return L.divIcon({
    className: "thiblo-marker",
    html: `<div class="pin ${kind}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22]
  });
}

function shopIcon(className, iconSize, iconAnchor) {
  return L.divIcon({
    className: "thiblo-marker",
    html: `<div class="${className}"></div>`,
    iconSize,
    iconAnchor,
    popupAnchor: [0, -34]
  });
}

function activeCompetitors(category) {
  return places.competitors.filter((c) => c.status !== "closed" && (!category || c.category === category));
}

function distanceMeters(a, b) {
  const r = 6371000;
  const toRad = (n) => n * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function nearestCompetitor(candidate, category) {
  const ranked = activeCompetitors(category)
    .map((competitor) => ({ competitor, meters: distanceMeters(candidate, competitor) }))
    .sort((a, b) => a.meters - b.meters);
  return ranked[0] || null;
}

function competitionCount(candidate, radius, category) {
  return activeCompetitors(category).filter((competitor) => distanceMeters(candidate, competitor) <= radius).length;
}

function candidateScore(candidate) {
  const sizeScore = candidate.sqm ? Math.min(5, Math.max(1, Math.round(candidate.sqm / 18))) : 3;
  const priceScore = candidate.price <= 450000 ? 5 : candidate.price <= 900000 ? 4 : candidate.price <= 1500000 ? 2 : 1;
  const direct600 = competitionCount(candidate, 600, "direct");
  const indirect500 = competitionCount(candidate, 500, "indirect");
  const nearestDirect = nearestCompetitor(candidate, "direct");
  const directPenalty = nearestDirect && nearestDirect.meters < 350 ? 3 : nearestDirect && nearestDirect.meters < 650 ? 1 : 0;
  const raw = candidate.traffic + candidate.fit + sizeScore + priceScore - direct600 * 1.6 - indirect500 * 0.5 - directPenalty;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

function popupForCandidate(candidate) {
  const direct = nearestCompetitor(candidate, "direct");
  const indirect = nearestCompetitor(candidate, "indirect");
  const direct600 = competitionCount(candidate, 600, "direct");
  const indirect500 = competitionCount(candidate, 500, "indirect");
  const approx = candidate.approximate ? "<p><strong>Ubicacion:</strong> aproximada.</p>" : "";
  return `
    <div class="popup">
      <h3>${candidate.name}</h3>
      <p><strong>Direccion:</strong> ${candidate.address}</p>
      <p><strong>Alquiler:</strong> ${candidate.priceLabel || "Consultar"}</p>
      <p><strong>Superficie:</strong> ${candidate.sqm ? `${candidate.sqm} m2` : "a confirmar"}</p>
      <p><strong>Directos en 600 m:</strong> ${direct600}</p>
      <p><strong>Indirectos en 500 m:</strong> ${indirect500}</p>
      <p><strong>Directo mas cercano:</strong> ${direct ? `${direct.competitor.name} (${Math.round(direct.meters)} m)` : "sin dato"}</p>
      <p><strong>Indirecto mas cercano:</strong> ${indirect ? `${indirect.competitor.name} (${Math.round(indirect.meters)} m)` : "sin dato"}</p>
      <p>${candidate.notes || ""}</p>
      ${approx}
      <p><a href="${candidate.sourceUrl}" target="_blank" rel="noreferrer">Fuente: ${candidate.source}</a></p>
    </div>
  `;
}

function popupForCompetitor(competitor) {
  const approx = competitor.approximate ? "<p><strong>Ubicacion:</strong> aproximada.</p>" : "";
  return `
    <div class="popup">
      <h3>${competitor.name}</h3>
      <p><strong>Direccion:</strong> ${competitor.address || "sin direccion"}</p>
      <p><strong>Tipo:</strong> ${competitor.category === "direct" ? "competencia directa" : "competencia indirecta"}</p>
      <p><strong>Estado:</strong> ${competitor.status || "active"}</p>
      ${approx}
      <p><a href="${competitor.sourceUrl}" target="_blank" rel="noreferrer">Fuente: ${competitor.source}</a></p>
    </div>
  `;
}

function drawCandidates() {
  candidateLayer.clearLayers();
  candidateMarkers.clear();
  places.candidates.forEach((candidate) => {
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return;
    const score = candidateScore(candidate);
    const marker = L.marker([candidate.lat, candidate.lng], { icon: icons.candidate })
      .bindPopup(popupForCandidate(candidate))
      .bindTooltip(`${score}/10 - ${candidate.name}`)
      .addTo(candidateLayer);
    marker.on("click", () => selectCandidate(candidate.id, { pan: false, openPopup: false }));
    candidateMarkers.set(candidate.id, marker);
  });
}

function drawCompetitors() {
  directLayer.clearLayers();
  indirectLayer.clearLayers();
  ringLayer.clearLayers();
  places.competitors.forEach((competitor) => {
    if (!Number.isFinite(competitor.lat) || !Number.isFinite(competitor.lng)) return;
    const isClosed = competitor.status === "closed";
    const isDirect = competitor.category === "direct";
    const targetLayer = isDirect ? directLayer : indirectLayer;
    const selectedIcon = isClosed ? icons.inactive : icons[competitor.category] || icons.indirect;

    L.marker([competitor.lat, competitor.lng], { icon: selectedIcon })
      .bindPopup(popupForCompetitor(competitor))
      .bindTooltip(competitor.name)
      .addTo(targetLayer);

    if (!isClosed) {
      L.circle([competitor.lat, competitor.lng], {
        radius: isDirect ? 350 : 250,
        color: isDirect ? "#b91c1c" : "#7c3aed",
        weight: 1,
        fillColor: isDirect ? "#b91c1c" : "#7c3aed",
        fillOpacity: isDirect ? 0.08 : 0.05
      }).addTo(ringLayer);
    }
  });
}

function drawZones() {
  zoneLayer.clearLayers();
  zones.forEach((zone) => {
    L.circle(zone.center, {
      radius: zone.radius,
      color: zone.color,
      weight: 2,
      fillColor: zone.color,
      fillOpacity: 0.08
    })
      .bindPopup(`<div class="popup"><h3>${zone.name}</h3><p>${zone.text}</p></div>`)
      .addTo(zoneLayer);
  });
}

function buildRanking() {
  const rows = [...places.candidates]
    .map((candidate) => ({
      candidate,
      score: candidateScore(candidate),
      nearestDirect: nearestCompetitor(candidate, "direct"),
      nearestIndirect: nearestCompetitor(candidate, "indirect"),
      direct600: competitionCount(candidate, 600, "direct"),
      indirect500: competitionCount(candidate, 500, "indirect")
    }))
    .sort((a, b) => b.score - a.score || (a.candidate.price || 999999999) - (b.candidate.price || 999999999));

  const body = document.getElementById("ranking");
  body.innerHTML = "";
  rows.forEach((row) => {
    const tone = row.score >= 8 ? "good" : row.score >= 6 ? "warn" : "bad";
    const tr = document.createElement("tr");
    tr.dataset.candidateId = row.candidate.id;
    tr.innerHTML = `
      <td><span class="score ${tone}">${row.score}</span></td>
      <td><strong>${row.candidate.name}</strong><br>${row.candidate.sqm ? `${row.candidate.sqm} m2` : "m2 a confirmar"}</td>
      <td>${row.candidate.priceLabel || "Consultar"}</td>
      <td>${row.direct600} dir. / ${row.indirect500} ind.<br>${row.nearestDirect ? `${Math.round(row.nearestDirect.meters)} m a ${row.nearestDirect.competitor.name}` : "sin directo"}</td>
    `;
    tr.addEventListener("click", () => selectCandidate(row.candidate.id, { pan: true, openPopup: true }));
    body.appendChild(tr);
  });

  document.getElementById("candidateCount").textContent = places.candidates.length;
  document.getElementById("competitorCount").textContent = activeCompetitors().length;
  document.getElementById("bestCount").textContent = rows.filter((r) => r.score >= 8).length;
}

function selectCandidate(candidateId, options = {}) {
  selectedCandidateId = candidateId;
  const candidate = places.candidates.find((item) => item.id === candidateId);
  if (!candidate) return;

  document.querySelectorAll("#ranking tr").forEach((row) => {
    row.classList.toggle("selected", row.dataset.candidateId === candidateId);
  });

  for (const [id, marker] of candidateMarkers.entries()) {
    marker.setIcon(id === candidateId ? icons.candidateSelected : icons.candidate);
    marker.setZIndexOffset(id === candidateId ? 1000 : 0);
  }

  const marker = candidateMarkers.get(candidateId);
  if (options.pan) map.setView([candidate.lat, candidate.lng], Math.max(map.getZoom(), 16), { animate: true });
  if (options.openPopup && marker) marker.openPopup();
}

function buildAnalysis() {
  const target = document.getElementById("analysis");
  target.innerHTML = zones.map((zone) => `
    <div class="analysis-card">
      <strong>${zone.name}</strong>
      <p>${zone.text}</p>
    </div>
  `).join("");
}

function updateLayerVisibility() {
  const toggle = (layer, checked) => {
    if (checked && !map.hasLayer(layer)) layer.addTo(map);
    if (!checked && map.hasLayer(layer)) map.removeLayer(layer);
  };
  toggle(candidateLayer, document.getElementById("toggleCandidates").checked);
  toggle(directLayer, document.getElementById("toggleDirect").checked);
  toggle(indirectLayer, document.getElementById("toggleIndirect").checked);
  toggle(ringLayer, document.getElementById("toggleRings").checked);
  toggle(zoneLayer, document.getElementById("toggleZones").checked);
}

function updateBounds() {
  const points = [
    ...places.candidates.map((point) => [point.lat, point.lng]),
    ...places.competitors.map((point) => [point.lat, point.lng])
  ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.18));
}

async function init() {
  const response = await fetch("data/places.json", { cache: "no-store" });
  places = await response.json();
  document.getElementById("lastUpdated").textContent = places.updatedAt
    ? `Ultima actualizacion: ${new Date(places.updatedAt).toLocaleString("es-AR")}`
    : "Ultima actualizacion: sin dato";

  drawCandidates();
  drawCompetitors();
  drawZones();
  buildRanking();
  buildAnalysis();
  updateLayerVisibility();
  updateBounds();

  ["toggleCandidates", "toggleDirect", "toggleIndirect", "toggleRings", "toggleZones"].forEach((id) => {
    document.getElementById(id).addEventListener("change", updateLayerVisibility);
  });
}

init().catch((error) => {
  console.error(error);
  document.getElementById("lastUpdated").textContent = "No se pudieron cargar los datos.";
});
