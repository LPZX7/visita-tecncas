const ORIGIN = { lat: -23.1177393, lon: -46.5547861 }; // Atibaia/SP
const GAS_PRICE = 6.0; // R$/litro
const KM_PER_LITER = 10;
const DRIVER_FEE = 100;
const ROAD_FACTOR = 1.35;
const TOLL_PER_KM_ONEWAY = 0.12;

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'mirontec-visitas-tecnicas/1.0 (deslocamento-calc)' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function calculateValorDeslocamento({ endereco, numero, bairro, cidade, estado }) {
  if (!cidade) return DRIVER_FEE;

  const fullQuery = [endereco, numero, bairro, cidade, estado, 'Brazil'].filter(Boolean).join(', ');
  let coords = await geocode(fullQuery);
  if (!coords) {
    coords = await geocode(`${cidade}, ${estado || ''}, Brazil`);
  }
  if (!coords) return DRIVER_FEE;

  const straightKm = haversineKm(ORIGIN, coords);
  const roadKm = straightKm * ROAD_FACTOR;
  const roundTripKm = roadKm * 2;
  const gasCost = (roundTripKm / KM_PER_LITER) * GAS_PRICE;
  const tollCost = roadKm * TOLL_PER_KM_ONEWAY * 2;
  return Math.round(gasCost + tollCost + DRIVER_FEE);
}

module.exports = { calculateValorDeslocamento };
