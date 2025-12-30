import { useCallback } from 'react';
import type { DeviceExpose } from '../../store/useDevicesStore';

// Feature access modes (bitmask)
export const FeatureAccessMode = {
  STATE: 1, // Can read
  SET: 2, // Can write
  GET: 4, // Can request value
} as const;

interface FeatureProps {
  expose: DeviceExpose;
  value: unknown;
  onChange: (property: string, value: unknown) => void;
  data?: Record<string, unknown>; // Full device data for composite features
}

// Binary toggle (ON/OFF, true/false)
export function BinaryFeature({ expose, value, onChange }: FeatureProps) {
  const canSet = (expose.access & FeatureAccessMode.SET) !== 0;
  const valueOn = expose.value_on ?? true;
  const valueOff = expose.value_off ?? false;
  const isOn = value === valueOn || value === true || value === 'ON';

  const handleChange = useCallback(() => {
    if (!canSet) return;
    const newValue = isOn ? valueOff : valueOn;
    onChange(expose.property, newValue);
  }, [canSet, isOn, valueOn, valueOff, expose.property, onChange]);

  const isContact = expose.name === 'contact' || expose.property === 'contact';
  const displayOn = isContact ? 'Closed' : 'ON';
  const displayOff = isContact ? 'Open' : 'OFF';

  if (!canSet) {
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <span
          className={`text-xs font-medium ${isOn ? 'text-emerald-500' : 'text-muted-foreground'}`}
        >
          {value === undefined ? 'N/A' : isOn ? displayOn : displayOff}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded hover:bg-background/50 transition-colors">
      <span className="text-xs text-muted-foreground">
        {expose.label || expose.name}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(expose.property, valueOff)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${!isOn ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {displayOff}
        </button>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isOn}
            onChange={handleChange}
            className="sr-only peer"
          />
          <div className="w-7 h-4 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
        <button
          onClick={() => onChange(expose.property, valueOn)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${isOn ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {displayOn}
        </button>
      </div>
    </div>
  );
}

// Numeric slider + input
export function NumericFeature({ expose, value, onChange }: FeatureProps) {
  const canSet = (expose.access & FeatureAccessMode.SET) !== 0;
  const numValue = typeof value === 'number' ? value : 0;
  const min = expose.value_min ?? 0;
  const max = expose.value_max ?? 100;
  const step = expose.value_step ?? 1;
  const unit = expose.unit || '';

  if (!canSet) {
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <span className="text-xs font-medium text-foreground">
          {value === undefined ? 'N/A' : `${numValue}${unit}`}
        </span>
      </div>
    );
  }

  return (
    <div className="py-1 px-2 bg-background/30 rounded space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={numValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) =>
              onChange(expose.property, parseFloat(e.target.value))
            }
            className="w-16 h-5 text-xs text-right bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={numValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(expose.property, parseFloat(e.target.value))}
        className="w-full h-1.5 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

// Enum dropdown/buttons
export function EnumFeature({ expose, value, onChange }: FeatureProps) {
  const canSet = (expose.access & FeatureAccessMode.SET) !== 0;
  const values = expose.values || [];
  const currentValue = value as string | undefined;

  if (!canSet) {
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <span className="text-xs font-medium text-foreground">
          {currentValue ?? 'N/A'}
        </span>
      </div>
    );
  }

  // Use buttons for small enums, dropdown for larger
  if (values.length <= 4) {
    return (
      <div className="py-1 px-2 bg-background/30 rounded space-y-1">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <div className="flex flex-wrap gap-0.5">
          {values.map((val) => (
            <button
              key={val}
              onClick={() => onChange(expose.property, val)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                currentValue === val
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
      <span className="text-xs text-muted-foreground">
        {expose.label || expose.name}
      </span>
      <select
        value={currentValue || ''}
        onChange={(e) => onChange(expose.property, e.target.value)}
        className="h-5 text-xs bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="" disabled>
          Select...
        </option>
        {values.map((val) => (
          <option key={val} value={val}>
            {val}
          </option>
        ))}
      </select>
    </div>
  );
}

// Text input
export function TextFeature({ expose, value, onChange }: FeatureProps) {
  const canSet = (expose.access & FeatureAccessMode.SET) !== 0;
  const textValue = typeof value === 'string' ? value : '';

  if (!canSet) {
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
        <span className="text-xs text-muted-foreground">
          {expose.label || expose.name}
        </span>
        <span
          className="text-xs font-medium text-foreground truncate max-w-[120px]"
          title={textValue}
        >
          {textValue || 'N/A'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
      <span className="text-xs text-muted-foreground">
        {expose.label || expose.name}
      </span>
      <input
        type="text"
        value={textValue}
        onChange={(e) => onChange(expose.property, e.target.value)}
        className="w-24 h-5 text-xs bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

// Generic value display for read-only or unknown types
export function ValueDisplay({
  expose,
  value,
}: {
  expose: DeviceExpose;
  value: unknown;
}) {
  let displayValue: string;

  if (value === undefined || value === null) {
    displayValue = 'N/A';
  } else if (typeof value === 'boolean') {
    displayValue = value ? 'ON' : 'OFF';
  } else if (typeof value === 'number') {
    displayValue = expose.unit ? `${value}${expose.unit}` : String(value);
  } else {
    displayValue = String(value);
  }

  return (
    <div className="flex items-center justify-between py-1 px-2 bg-background/30 rounded">
      <span className="text-xs text-muted-foreground">
        {expose.label || expose.name}
      </span>
      <span className="text-xs font-medium text-foreground">
        {displayValue}
      </span>
    </div>
  );
}

// Composite feature with sub-features (switch, light, cover, lock, climate, fan)
export function CompositeFeature({ expose, onChange, data }: FeatureProps) {
  const features = expose.features || [];

  if (features.length === 0) {
    return <ValueDisplay expose={expose} value={data?.[expose.property]} />;
  }

  return (
    <div className="space-y-0.5">
      {features.map((subExpose) => (
        <Feature
          key={subExpose.property || subExpose.name}
          expose={subExpose}
          value={data?.[subExpose.property]}
          onChange={onChange}
          data={data}
        />
      ))}
    </div>
  );
}

// Main Feature renderer that picks the right component
export function Feature({ expose, value, onChange, data }: FeatureProps) {
  // Get label with fallback to name
  const label = expose.label || expose.name || expose.property;
  const exposeWithLabel = { ...expose, label };

  switch (expose.type) {
    case 'binary':
      return (
        <BinaryFeature
          expose={exposeWithLabel}
          value={value}
          onChange={onChange}
        />
      );
    case 'numeric':
      return (
        <NumericFeature
          expose={exposeWithLabel}
          value={value}
          onChange={onChange}
        />
      );
    case 'enum':
      return (
        <EnumFeature
          expose={exposeWithLabel}
          value={value}
          onChange={onChange}
        />
      );
    case 'text':
      return (
        <TextFeature
          expose={exposeWithLabel}
          value={value}
          onChange={onChange}
        />
      );

    // Composite types with sub-features
    case 'switch':
    case 'light':
    case 'cover':
    case 'lock':
    case 'climate':
    case 'fan':
    case 'composite':
      return (
        <CompositeFeature
          expose={exposeWithLabel}
          value={value}
          onChange={onChange}
          data={data}
        />
      );

    default:
      return <ValueDisplay expose={exposeWithLabel} value={value} />;
  }
}
