# Prototype Marseille (Your Place 1.7.0)

This experiment extends the source app's maximum model plate from 4 km to 6 km and adds two Marseille presets.

- **Marseille centre:** 43.29300, 5.37000; 6 × 6 km. Includes a large part of the continental 1st, 2nd, 6th and 7th arrondissements, but NOT the remote Frioul islands, and not the full maritime/northern edges of Arenc.
- **Vieux-Port:** 43.29530, 5.37230; 2.4 × 2.4 km, higher perceived spatial detail.

This is a 3D volumetric model (terrain + OSM building footprints/heights, often estimated), not photogrammetry. An administrative-exact multi-tile mosaic and more realistic façades would require further work. Map data © OpenStreetMap contributors (ODbL). Code MIT.

Start: npm ci && npm run dev; open http://localhost:5173/#lat=43.29300&lon=5.37000&km=6&ex=1.5
