# Thiblo Lanus Intel

Mapa interactivo para evaluar locales en alquiler y competencia alrededor de Lanus Oeste para una posible nueva sucursal de Thiblo.

## Uso local

Abrir `index.html` en el navegador o levantar un server simple:

```bash
npm run serve
```

## Actualizacion de datos

```bash
npm run scrape
```

El scraper:

- consulta paginas publicas de avisos inmobiliarios;
- mantiene una base historica en `data/places.json`;
- geocodifica nuevas direcciones con Nominatim/OpenStreetMap;
- suma competencia indirecta desde Overpass/OpenStreetMap cuando esta disponible;
- actualiza `data/last-run.json`.

## GitHub Pages

El workflow `.github/workflows/update-and-deploy.yml` corre todos los dias a la manana de Argentina, commitea cambios de datos si los hay y publica el sitio en GitHub Pages.
