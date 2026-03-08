import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

/* ───────── Types ───────── */

export interface AddressValue {
  street: string;
  city: string;
  floor?: string;
  apartment?: string;
  notes?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
  };
}

interface Props {
  value: AddressValue;
  onChange: (addr: AddressValue) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showExtras?: boolean; // show floor/apartment fields
}

/* ───────── Component ───────── */

export default function AddressAutocomplete({
  value,
  onChange,
  label = 'כתובת',
  placeholder = 'הקלד כתובת...',
  required = false,
  showExtras = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize query from value
  useEffect(() => {
    const display = [value.street, value.city].filter(Boolean).join(', ');
    if (display && !query) setQuery(display);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchAddress = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        countrycodes: 'il',
        format: 'json',
        addressdetails: '1',
        'accept-language': 'he',
        limit: '6',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'LaundryOS/1.0' },
      });
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    // Also update the raw value for manual typing fallback
    onChange({ ...value, street: val, city: value.city });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => searchAddress(val), 400);
  };

  const handleSelect = (result: NominatimResult) => {
    const addr = result.address;
    const street = [addr.road, addr.house_number].filter(Boolean).join(' ');
    const city = addr.city || addr.town || addr.village || '';

    const display = [street, city].filter(Boolean).join(', ');
    setQuery(display);
    setIsOpen(false);
    onChange({ ...value, street, city });
  };

  const formatResultDisplay = (r: NominatimResult): string => {
    const addr = r.address;
    const parts: string[] = [];
    if (addr.road) {
      parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
    }
    const city = addr.city || addr.town || addr.village;
    if (city) parts.push(city);
    if (addr.suburb && addr.suburb !== city) parts.push(addr.suburb);
    return parts.join(', ') || r.display_name.split(',').slice(0, 3).join(', ');
  };

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Main address input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <MapPin className="w-4 h-4 inline ml-1 text-blue-500" />
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder={placeholder}
            required={required}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            autoComplete="off"
          />
          {isLoading && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}

          {/* Dropdown */}
          {isOpen && results.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {results.map((r) => (
                <li
                  key={r.place_id}
                  onClick={() => handleSelect(r)}
                  className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0 flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>{formatResultDisplay(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Floor & Apartment */}
      {showExtras && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">עיר</label>
            <input
              type="text"
              value={value.city}
              onChange={e => onChange({ ...value, city: e.target.value })}
              placeholder="עיר"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">קומה</label>
            <input
              type="text"
              value={value.floor || ''}
              onChange={e => onChange({ ...value, floor: e.target.value })}
              placeholder="קומה"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">דירה</label>
            <input
              type="text"
              value={value.apartment || ''}
              onChange={e => onChange({ ...value, apartment: e.target.value })}
              placeholder="דירה"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
