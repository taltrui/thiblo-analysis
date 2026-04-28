import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);
const DATA_PATH = new URL("../data/places.json", import.meta.url);
const RUN_PATH = new URL("../data/last-run.json", import.meta.url);
const GEOCODE_CACHE_PATH = new URL("../data/geocode-cache.json", import.meta.url);

const USER_AGENT = "ThibloLanusIntel/1.0 (contact: github-actions)";
const LANUS_BBOX = {
  south: -34.742,
  west: -58.435,
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
    name: "Argenprop Remedios de Escalada",
    url: "https://www.argenprop.com/locales/alquiler/remedios-de-escalada",
    parser: parseGenericRentalText
  },
  {
    name: "Argenprop cocheras/locales Remedios de Escalada",
    url: "https://www.argenprop.com/cocheras-o-locales/alquiler/remedios-de-escalada",
    parser: parseGenericRentalText
  },
  {
    name: "Argenprop galpones/locales Remedios de Escalada",
    url: "https://www.argenprop.com/galpones-o-locales/alquiler/remedios-de-escalada",
    parser: parseGenericRentalText
  },
  {
    name: "Inmuebles Clarin Lanus Oeste",
    url: "https://www.inmuebles.clarin.com/locales/alquiler/lanus-oeste",
    parser: parseGenericRentalText
  },
  {
    name: "Inmuebles Clarin Remedios de Escalada",
    url: "https://www.inmuebles.clarin.com/locales/alquiler/remedios-de-escalada",
    parser: parseGenericRentalText
  },
  {
    name: "MercadoLibre Inmuebles Lanus Oeste",
    url: "https://inmuebles.mercadolibre.com.ar/locales/alquiler/bsas-gba-sur/lanus/lanus-oeste/",
    parser: parseGenericRentalText
  },
  {
    name: "MercadoLibre Inmuebles Remedios de Escalada",
    url: "https://inmuebles.mercadolibre.com.ar/locales/alquiler/bsas-gba-sur/lanus/remedios-de-escalada/",
    parser: parseGenericRentalText
  },
  {
    name: "Properati Lanus Oeste",
    url: "https://www.properati.com.ar/s/lanus-oeste/local/alquiler",
    parser: parseGenericRentalText
  },
  {
    name: "Zonaprop Tagle Lanus Oeste",
    url: "https://www.zonaprop.com.ar/locales-comerciales-alquiler-lanus-oeste-orden-precio-ascendente.html",
    parser: parseGenericRentalText
  },
  {
    name: "Zonaprop Remedios de Escalada",
    url: "https://www.zonaprop.com.ar/locales-comerciales-alquiler-remedios-de-escalada.html",
    parser: parseGenericRentalText
  }
];

const TRUSTED_SEED_CANDIDATES = [
  candidateSeed("rent-doctor-melo-4400", "Doctor Melo 4400", "Doctor Melo 4400, Remedios de Escalada", -34.7242983, -58.397295, 650000, "$650.000 + $80.000 expensas", 140, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Esquina con doble vidriera en centro de Escalada. Muy buena exposicion."),
  candidateSeed("rent-albarracin-2400", "Albarracin 2400", "Albarracin 2400, Remedios de Escalada", -34.7246144, -58.386304, 500000, "$500.000", 75, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Local/deposito 15x5 aprox. Sin expensas segun aviso."),
  candidateSeed("rent-general-hornos-1415", "General Hornos 1415", "General Hornos 1415, Remedios de Escalada", -34.7273508, -58.4172236, 680000, "$680.000", 46, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Local/galpon en buen estado con cortina metalica y bano."),
  candidateSeed("rent-malabia-500", "Malabia 500", "Malabia 500, Remedios de Escalada", -34.7367923, -58.3875619, 300000, "$300.000", null, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Local sobre zona comercial. Confirmar superficie antes de priorizar."),
  candidateSeed("rent-29-septiembre-3800", "29 de Septiembre 3800", "29 de Septiembre 3800, Remedios de Escalada", -34.7327309, -58.3900168, 1300000, "$1.300.000", 182, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Local grande de 180 m2 aprox. en Remedios de Escalada."),
  candidateSeed("rent-ministro-brin-4400", "Ministro Brin 4400", "Ministro Brin 4400, Remedios de Escalada", -34.7241253, -58.3983989, 370000, "$370.000-$420.000", 20, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Zona comercial cerca de Beltran. Buen precio, superficie chica."),
  candidateSeed("rent-beltran-323", "Beltran 323", "Beltran 323, Remedios de Escalada", -34.7254023, -58.399332, 650000, "$650.000", 24, "Argenprop Remedios de Escalada", "https://www.argenprop.com/locales/alquiler/remedios-de-escalada", "Pleno centro de Remedios de Escalada, local refaccionado."),
  candidateSeed("rent-uriarte-965", "Uriarte 965", "Uriarte 965, Remedios de Escalada", -34.7334422, -58.4082535, 500000, "$500.000", 13, "Argenprop Remedios de Escalada", "https://www.argenprop.com/cocheras-o-locales/alquiler/remedios-de-escalada", "Local a estrenar sobre Uriarte; chico pero en arteria comercial."),
  candidateSeed("rent-zarate-100", "Zarate 100", "Zarate 100, Remedios de Escalada", -34.7307801, -58.3976787, 1300000, "$1.300.000", 225, "Argenprop Remedios de Escalada", "https://www.argenprop.com/galpones-o-locales/alquiler/remedios-de-escalada", "Deposito/galpon amplio. Puede servir si el foco es mayorista/logistica."),
  candidateSeed("rent-fray-mamerto-esquiu-3200", "Fray Mamerto Esquiu 3200", "Fray Mamerto Esquiu 3200, Remedios de Escalada", -34.7249559, -58.389647, 500000, "$500.000", 187, "Argenprop Remedios de Escalada", "https://www.argenprop.com/galpones-o-locales/alquiler/remedios-de-escalada", "Galpon en esquina transitada; requiere evaluar estado/refacciones."),
  candidateSeed("rent-gobernador-vergara-3415", "Gobernador Vergara 3415", "Gobernador Vergara 3415, Remedios de Escalada", -34.7155275, -58.4098222, null, "Consultar", 15, "MercadoLibre Inmuebles", "https://inmuebles.mercadolibre.com.ar/locales/bsas-gba-sur/lanus/locales-en-alquiler-lanus", "Local a estrenar segun resultado de MercadoLibre. Confirmar precio."),
  candidateSeed("rent-tagle-3589", "Tagle 3589", "Tagle 3589, Lanus Oeste", -34.6973039, -58.4267082, 450000, "$450.000", 48, "Zonaprop", "https://www.zonaprop.com.ar/propiedades/clasificado/alcllcin-local-zona-comercial-58125903.html", "Local 4x12 en zona comercial Tagle. Buen candidato para cubrir Villa Caraza/Tagle."),
  candidateSeed("rent-tagle-3823", "Tagle 3823", "Tagle 3823, Lanus Oeste", -34.6987819, -58.4294599, 1200000, "$1.200.000", 40, "Novosad Propiedades", "https://www.novosadpropiedades.com.ar/propiedad/alquiler-de-otro-inmueble-en-lanus-oeste-lanus-buenos-aires-3439-255935", "Casa con local comercial en PB y deposito. Evaluar si se puede alquilar/usar como local puro."),
  candidateSeed("rent-enrique-fernandez-2100", "Enrique Fernandez 2100", "Enrique Fernandez 2100, Lanus Oeste", -34.6911887, -58.40747, 450000, "$450.000", 25, "Zonaprop", "https://www.zonaprop.com.ar/locales-comerciales-lanus-oeste-con-desague-cloacal-orden-precio-ascendente.html", "A metros de centro comercial; local compacto sin expensas."),
  candidateSeed("rent-rivadavia-2602-coto", "Rivadavia 2602 - Coto Lanus", "Rivadavia 2602, Lanus Oeste", -34.6904895, -58.420636, 500000, "$500.000 + $150.000 expensas", 45, "Zonaprop", "https://www.zonaprop.com.ar/locales-comerciales-lanus-oeste-con-luz-orden-precio-ascendente.html", "Local dentro de Coto Lanus. Alto flujo indirecto, pero formato shopping/sucursal."),
  candidateSeed("rent-25-mayo-975", "25 de Mayo 975", "25 de Mayo 975, Lanus Oeste", -34.705496, -58.4064641, 500000, "$500.000", 35, "Zonaprop", "https://www.zonaprop.com.ar/locales-comerciales-alquiler-lanus-oeste-con-apto-profesional-publicado-hace-menos-de-15-dias.html", "Local 4.4x8 con deposito y bano, cerca de 25 de Mayo."),
  candidateSeed("rent-viamonte-2349", "Viamonte 2349", "Viamonte 2349, Lanus Oeste", -34.6887543, -58.4165585, 750000, "$750.000", 70, "Zonaprop", "https://www.zonaprop.com.ar/locales-comerciales-alquiler-lanus-oeste-a-estrenar.html", "Dos salones de venta, deposito/oficina y bano. Buena exposicion hacia avenidas.")
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
  const seedAdded = mergeTrustedSeeds(places, knownCandidateIds, startedAt);
  run.sources.push({
    name: "Trusted seed candidates",
    url: "manual/web-search",
    found: TRUSTED_SEED_CANDIDATES.length,
    added: seedAdded
  });
  run.addedCandidates += seedAdded;

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
    if (!address || !price || price < 250000) continue;

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
  return /lanus oeste|lanús oeste|remedios de escalada|tagle/i.test(`${candidate.address} ${candidate.name}`);
}

function inferTraffic(address) {
  if (/hipolito|yrigoyen|25 de mayo|remedios|san martin|gobernador|aristobulo|tagle|melo|beltran|brin|29 de septiembre|rivadavia/i.test(address)) return 5;
  return 3;
}

function inferFit(sqm, price) {
  if (sqm && sqm >= 45 && sqm <= 140 && price && price <= 1200000) return 5;
  if (sqm && sqm >= 25 && price && price <= 900000) return 4;
  if (sqm && sqm < 18) return 2;
  return 3;
}

function candidateSeed(id, name, address, lat, lng, price, priceLabel, sqm, source, sourceUrl, notes) {
  return {
    id,
    name,
    address,
    lat,
    lng,
    price,
    priceLabel,
    sqm,
    traffic: inferTraffic(address),
    fit: inferFit(sqm, price),
    status: "active",
    source,
    sourceUrl,
    notes
  };
}

function mergeTrustedSeeds(places, knownCandidateIds, timestamp) {
  let added = 0;
  for (const seed of TRUSTED_SEED_CANDIDATES) {
    if (knownCandidateIds.has(seed.id)) {
      const existing = places.candidates.find((item) => item.id === seed.id);
      Object.assign(existing, {
        ...seed,
        discoveredAt: existing.discoveredAt || timestamp,
        lastSeenAt: timestamp
      });
      continue;
    }

    places.candidates.push({
      ...seed,
      discoveredAt: timestamp,
      lastSeenAt: timestamp
    });
    knownCandidateIds.add(seed.id);
    added += 1;
  }
  return added;
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
      node["shop"~"supermarket|convenience|wholesale|chemist|houseware|doityourself|department_store"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
      way["shop"~"supermarket|convenience|wholesale|chemist|houseware|doityourself|department_store"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
      relation["shop"~"supermarket|convenience|wholesale|chemist|houseware|doityourself|department_store"](${LANUS_BBOX.south},${LANUS_BBOX.west},${LANUS_BBOX.north},${LANUS_BBOX.east});
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
