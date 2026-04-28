import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);
const DATA_PATH = new URL("../data/places.json", import.meta.url);
const RUN_PATH = new URL("../data/last-run.json", import.meta.url);
const GEOCODE_CACHE_PATH = new URL("../data/geocode-cache.json", import.meta.url);

const USER_AGENT = "ThibloLanusIntel/1.0 (contact: github-actions)";
const LANUS_BBOX = {
  south: -34.718,
  west: -58.425,
  north: -34.684,
  east: -58.37
};

const RENTAL_SOURCES = [
  {
    name: "Zonaprop Lanus Oeste",
    url: "https://www.zonaprop.com.ar/locales-comerciales-alquiler-lanus-oeste.html",
    parser: parseGenericRentalText
  },
  {
    name: "Zonaprop Lanus Oeste keyword",
    url: "https://www.zonaprop.com.ar/locales-comerciales-alquiler-q-lanus-oeste.html",
    parser: parseGenericRentalText
  },
  {
    name: "Argenprop Lanus Oeste",
    url: "https://www.argenprop.com/locales/alquiler/lanus-oeste",
    parser: parseGenericRentalText
  },
  {
    name: "Inmuebles Clarin Lanus Oeste",
    url: "https://www.inmuebles.clarin.com/locales/alquiler/lanus-oeste",
    parser: parseGenericRentalText
  },
  {
    name: "MercadoLibre Inmuebles Lanus Oeste",
    url: "https://inmuebles.mercadolibre.com.ar/locales/alquiler/bsas-gba-sur/lanus/lanus-oeste/",
    parser: parseGenericRentalText
  },
  {
    name: "Properati Lanus Oeste",
    url: "https://www.properati.com.ar/s/lanus-oeste/local/alquiler",
    parser: parseGenericRentalText
  }
];

async function main() {
  const startedAt = new Date().toISOString();
  const places = await readJson(DATA_PATH);
  const geocodeCache = await readJson(GEOCODE_CACHE_PATH, {});
  const run = {
    startedAt,
    updatedAt: null,
    status: "running",
    sources: [],
    addedCandidates: 0,
    addedCompetitors: 0,
    errors: []
  };

  const knownCandidateIds = new Set(places.candidates.map((item) => item.id));

  for (const source of RENTAL_SOURCES) {
    try {
      const html = await fetchText(source.url);
      const found = source.parser(html, source);
      let added = 0;

      for (const candidate of found) {
        if (!looksLanus(candidate)) continue;
        if (!candidate.lat || !candidate.lng) {
          const geo = await geocode(candidate.address, geocodeCache);
          if (geo) {
            candidate.lat = geo.lat;
            candidate.lng = geo.lng;
            candidate.approximate = geo.approximate;
          }
        }
        if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) continue;

        candidate.id = candidate.id || makeId("rent", candidate.address || candidate.name);
        candidate.discoveredAt = candidate.discoveredAt || startedAt;
        candidate.lastSeenAt = startedAt;

        if (!knownCandidateIds.has(candidate.id)) {
          places.candidates.push(candidate);
          knownCandidateIds.add(candidate.id);
          added += 1;
        } else {
          const existing = places.candidates.find((item) => item.id === candidate.id);
          Object.assign(existing, {
            price: candidate.price || existing.price,
            priceLabel: candidate.priceLabel || existing.priceLabel,
            sqm: candidate.sqm || existing.sqm,
            source: candidate.source || existing.source,
            sourceUrl: candidate.sourceUrl || existing.sourceUrl,
            lastSeenAt: startedAt
          });
        }
      }

      run.sources.push({ name: source.name, url: source.url, found: found.length, added });
      run.addedCandidates += added;
    } catch (error) {
      run.errors.push({ source: source.name, message: error.message });
    }
  }

  try {
    const competitors = await fetchOsmCompetitors();
    const knownCompetitorIds = new Set(places.competitors.map((item) => item.id));
    let added = 0;
    for (const competitor of competitors) {
      if (!knownCompetitorIds.has(competitor.id)) {
        places.competitors.push(competitor);
        knownCompetitorIds.add(competitor.id);
        added += 1;
      }
    }
    run.sources.push({ name: "OpenStreetMap Overpass", url: "https://overpass-api.de/api/interpreter", found: competitors.length, added });
    run.addedCompetitors += added;
  } catch (error) {
    run.errors.push({ source: "OpenStreetMap Overpass", message: error.message });
  }

  places.candidates = dedupeById(places.candidates)
    .sort((a, b) => scoreForSort(b) - scoreForSort(a) || (a.price || 999999999) - (b.price || 999999999));
  places.competitors = dedupeById(places.competitors)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
  places.updatedAt = new Date().toISOString();
  places.sourceNote = "Actualizado automaticamente por scripts/update-data.mjs. Algunas coordenadas pueden ser aproximadas.";

  run.updatedAt = places.updatedAt;
  run.status = run.errors.length ? "completed_with_warnings" : "completed";

  await writeJson(DATA_PATH, places);
  await writeJson(RUN_PATH, run);
  await writeJson(GEOCODE_CACHE_PATH, geocodeCache);

  console.log(JSON.stringify(run, null, 2));
}

async function readJson(fileUrl, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(fileUrl, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function writeJson(fileUrl, data) {
  const filePath = fileURLToPath(fileUrl);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "es-AR,es;q=0.9,en;q=0.7"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function parseGenericRentalText(html, source) {
  const text = normalizeText(stripTags(html));
  const chunks = text
    .split(/(?=(?:Local|Locales|Inmueble comercial|Alquiler Local|Local Comercial).{0,90}(?:Lanus Oeste|Lanús Oeste))/gi)
    .slice(0, 80);

  const candidates = [];
  for (const chunk of chunks) {
    if (!/alquiler/i.test(chunk) || !/lan[uú]s oeste/i.test(chunk)) continue;

    const price = parsePrice(chunk);
    const sqm = parseSqm(chunk);
    const address = parseAddress(chunk);
    if (!address || !price) continue;

    const cleanAddress = `${address}, Lanus Oeste`;
    candidates.push({
      id: makeId("rent", cleanAddress),
      name: address,
      address: cleanAddress,
      price,
      priceLabel: formatPrice(price),
      sqm,
      traffic: inferTraffic(cleanAddress),
      fit: inferFit(sqm, price),
      status: "active",
      source: source.name,
      sourceUrl: source.url,
      notes: "Hallado automaticamente; verificar disponibilidad, requisitos y medidas con la inmobiliaria."
    });
  }

  return dedupeById(candidates);
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(text) {
  const ars = text.match(/\$\s*([0-9][0-9.\s]{3,})/);
  if (ars) return Number(ars[1].replace(/\D/g, ""));
  return null;
}

function parseSqm(text) {
  const match = text.match(/([0-9]+(?:[,.][0-9]+)?)\s*m(?:²|2| )/i);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

function parseAddress(text) {
  const patterns = [
    /((?:Av\.?|Avenida)\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ .']+\s+(?:al\s+)?[0-9]{1,5})/i,
    /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .']+\s+(?:al\s+)?[0-9]{1,5})\s+(?:Lanus Oeste|Lanús Oeste)/i,
    /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .']+\s+y\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ .']+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return titleCase(match[1].replace(/\s+/g, " ").trim());
  }
  return null;
}

function looksLanus(candidate) {
  return /lanus oeste|lanús oeste/i.test(`${candidate.address} ${candidate.name}`);
}

function inferTraffic(address) {
  if (/hipolito|yrigoyen|25 de mayo|remedios|san martin|gobernador|aristobulo/i.test(address)) return 5;
  return 3;
}

function inferFit(sqm, price) {
  if (sqm && sqm >= 45 && sqm <= 140 && price && price <= 1200000) return 5;
  if (sqm && sqm >= 25 && price && price <= 900000) return 4;
  if (sqm && sqm < 18) return 2;
  return 3;
}

function formatPrice(price) {
  return `$${Number(price).toLocaleString("es-AR")}`;
}

function titleCase(value) {
  return value
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAv\b\.?/g, "Av.")
    .replace(/\bAl\b/g, "al");
}

async function geocode(address, cache) {
  const key = normalizeKey(address);
  if (cache[key]) return cache[key];

  await delay(1100);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", `${address}, Buenos Aires, Argentina`);

  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const results = await response.json();
  if (!results.length) return null;

  const result = {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    approximate: !/^\d+/.test(String(results[0].display_name || ""))
  };
  cache[key] = result;
  return result;
}

async function fetchOsmCompetitors() {
  const query = `
    [out:json][timeout:25];
    (
      node["shop"~"supermarket|convenience|wholesale|chemist|houseware"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
      way["shop"~"supermarket|convenience|wholesale|chemist|houseware"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
      relation["shop"~"supermarket|convenience|wholesale|chemist|houseware"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
    );
    out center tags;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT
    },
    body: new URLSearchParams({ data: query })
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);

  const payload = await response.json();
  return (payload.elements || [])
    .map((element) => {
      const tags = element.tags || {};
      const name = tags.name || tags.brand || tags.operator;
      if (!name) return null;
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const isDirect = /limp|clor|quim|droguer/i.test(name);
      return {
        id: `osm-${element.type}-${element.id}`,
        name,
        address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || "Lanus Oeste",
        lat,
        lng,
        category: isDirect ? "direct" : "indirect",
        status: "active",
        source: "OpenStreetMap",
        sourceUrl: "https://www.openstreetmap.org/",
        osm: {
          type: element.type,
          id: element.id,
          shop: tags.shop
        }
      };
    })
    .filter(Boolean);
}

function makeId(prefix, value) {
  return `${prefix}-${normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeById(items) {
  const seen = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}

function scoreForSort(candidate) {
  const sizeScore = candidate.sqm ? Math.min(5, Math.max(1, Math.round(candidate.sqm / 18))) : 3;
  const priceScore = candidate.price <= 450000 ? 5 : candidate.price <= 900000 ? 4 : candidate.price <= 1500000 ? 2 : 1;
  return candidate.traffic + candidate.fit + sizeScore + priceScore;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(async (error) => {
  const run = {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "failed",
    errors: [{ message: error.message, stack: error.stack }]
  };
  await writeJson(RUN_PATH, run);
  console.error(error);
  process.exit(1);
});
