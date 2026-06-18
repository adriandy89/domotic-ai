import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import tzlookup from 'tz-lookup';
import { Search, Loader2, MapPin } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';

// Fix for default marker icons in leaflet not loading correctly in some bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface HomeLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  timezone: string | null;
  onChange: (updates: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    timezone: string | null;
  }) => void;
}

function LocationMarker({
  position,
  setPosition,
  setAddress,
  setTimezone,
}: {
  position: L.LatLng | null;
  setPosition: (pos: L.LatLng) => void;
  setAddress: (addr: string) => void;
  setTimezone: (tz: string) => void;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker>(null);

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      );
      const data = await res.json();
      if (data && data.display_name) {
        setAddress(data.display_name);
      }
    } catch (e) {
      console.error('Reverse geocoding failed', e);
    }
  };

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
      const tz = tzlookup(e.latlng.lat, e.latlng.lng);
      setTimezone(tz);
      fetchAddress(e.latlng.lat, e.latlng.lng);
    },
  });

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          setPosition(newPos);
          map.flyTo(newPos, map.getZoom());
          const tz = tzlookup(newPos.lat, newPos.lng);
          setTimezone(tz);
          fetchAddress(newPos.lat, newPos.lng);
        }
      },
    }),
    [map, setPosition, setAddress, setTimezone],
  );

  return position === null ? null : (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
}

// Ensure the outer React component has access to useMemo
import { useMemo } from 'react';

export function HomeLocationMap({
  latitude,
  longitude,
  address,
  timezone,
  onChange,
}: HomeLocationMapProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<L.LatLngTuple>([
    latitude || 40.4168,
    longitude || -3.7038, // Default to Madrid if none
  ]);

  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      setMapCenter([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const currentPosition =
    latitude !== null && longitude !== null
      ? new L.LatLng(latitude, longitude)
      : null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchQuery,
        )}&format=json&limit=1`,
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newLat = parseFloat(lat);
        const newLon = parseFloat(lon);
        const newTz = tzlookup(newLat, newLon);

        setMapCenter([newLat, newLon]);
        onChange({
          latitude: newLat,
          longitude: newLon,
          address: display_name,
          timezone: newTz,
        });
      }
    } catch (e) {
      console.error('Geocoding search failed', e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">{t('access.homes.locationSearch', 'Search Location')}</label>
        <div className="flex gap-2">
          <Input
            placeholder={t('access.homes.searchAddressPlaceholder', 'Type an address...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="h-[300px] w-full rounded-md border border-border overflow-hidden">
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker
            position={currentPosition}
            setPosition={(pos) =>
              onChange({ latitude: pos.lat, longitude: pos.lng, address, timezone })
            }
            setAddress={(addr) =>
              onChange({ latitude, longitude, address: addr, timezone })
            }
            setTimezone={(tz) =>
              onChange({ latitude, longitude, address, timezone: tz })
            }
          />
          <MapUpdater center={mapCenter} />
        </MapContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-2 p-3 bg-muted/50 rounded-lg border border-border/50">
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" /> Address
          </span>
          <span className="text-sm leading-tight text-foreground/90">{address || 'Not set'}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Search className="w-3.5 h-3.5" /> Timezone
          </span>
          <span className="text-sm leading-tight text-foreground/90">{timezone || 'Not set'}</span>
        </div>
      </div>
    </div>
  );
}

// Helper component to update map center from props
function MapUpdater({ center }: { center: L.LatLngTuple }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom());
  }, [center, map]);
  return null;
}
