import { useState } from 'react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export default function MapLink({ address, label = 'Ver no mapa' }) {
  const [expanded, setExpanded] = useState(false);

  if (!address) return <span className="map-link map-link--disabled">Sem endereço</span>;

  const externalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  if (!API_KEY) {
    return (
      <a href={externalUrl} target="_blank" rel="noreferrer" className="map-link">
        📍 {label}
      </a>
    );
  }

  return (
    <div className="map-widget">
      <button type="button" className="map-link" onClick={() => setExpanded(!expanded)}>
        📍 {expanded ? 'Ocultar mapa' : label}
      </button>
      {expanded && (
        <iframe
          className="map-embed"
          title={`Mapa - ${address}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${API_KEY}&q=${encodeURIComponent(address)}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
    </div>
  );
}
