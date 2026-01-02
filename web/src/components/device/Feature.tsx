import { useCallback, useState, useEffect } from 'react';
import convert from 'color-convert';
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

  // Use local state to avoid sending commands while dragging
  const [currentValue, setCurrentValue] = useState(numValue);

  // Update local state when prop value changes
  useEffect(() => {
    setCurrentValue(numValue);
  }, [numValue]);

  const handleCommit = () => {
    if (currentValue !== numValue) {
      onChange(expose.property, currentValue);
    }
  };

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
            value={currentValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setCurrentValue(parseFloat(e.target.value))}
            onBlur={handleCommit}
            className="w-16 h-5 text-xs text-right bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={currentValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setCurrentValue(parseFloat(e.target.value))}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
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
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${currentValue === val
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

  // Use local state to avoid sending commands on every keystroke
  const [currentText, setCurrentText] = useState(textValue);

  useEffect(() => {
    setCurrentText(textValue);
  }, [textValue]);

  const handleCommit = () => {
    if (currentText !== textValue) {
      onChange(expose.property, currentText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommit();
      (e.target as HTMLInputElement).blur();
    }
  };

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
        value={currentText}
        onChange={(e) => setCurrentText(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
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

// Color conversion helpers
type AnyColor = { x?: number; y?: number; hue?: number; saturation?: number; r?: number; g?: number; b?: number };
type ColorFormat = 'color_xy' | 'color_hs' | 'color_rgb';

const toRGB = (source: AnyColor, sourceFormat: ColorFormat): string => {
  switch (sourceFormat) {
    case 'color_xy': {
      const { x = 0, y = 0 } = source;
      const z = 1.0 - x - y;
      const Y = 1;
      const X = (Y / y) * x;
      const Z = (Y / y) * z;
      return '#' + convert.xyz.hex([X * 100.0, Y * 100.0, Z * 100.0]);
    }
    case 'color_hs': {
      const { hue = 0, saturation = 0 } = source;
      return '#' + convert.hsv.hex([hue, saturation, 100]);
    }
    case 'color_rgb': {
      const { r = 0, g = 0, b = 0 } = source;
      return '#' + convert.rgb.hex([r, g, b]);
    }
    default:
      return '#FFFFFF';
  }
};

const pridePalette = ['#FF0018', '#FFA52C', '#FFFF41', '#008018', '#0000F9', '#86007D'];
const whitePalette = ['#FFFFFF', '#FDF4DC', '#F4FDFF'];

// Color feature for lights with color_xy, color_hs, color_rgb
export function ColorFeature({ expose, onChange, data }: FeatureProps) {
  const features = expose.features || [];
  const format = expose.name as ColorFormat;

  // Build current color value from sub-features
  // Use innerFeature.name as key (e.g., "x", "y") not property
  const value: AnyColor = {};
  for (const innerFeature of features) {
    const val = data?.[innerFeature.property];
    if (val !== undefined) {
      value[innerFeature.name as keyof AnyColor] = val as number;
    }
  }

  const [currentColor, setCurrentColor] = useState<string>(toRGB(value, format));

  // Update currentColor when device color changes
  // Use JSON.stringify to properly detect object changes
  useEffect(() => {
    const newColor = toRGB(value, format);
    setCurrentColor(newColor);
  }, [JSON.stringify(value), format]);

  // Just sends the command
  const sendColorCommand = (hexColor: string) => {
    // Send hex directly - backend will convert to the appropriate format
    // This matches old frontend behavior where ColorEditor sends { hex: color }
    console.log('Color change - sending hex:', expose.property, { hex: hexColor });
    onChange(expose.property, { hex: hexColor });
  };

  // Updates local state + sends command (for palette buttons)
  const handlePaletteClick = (hexColor: string) => {
    setCurrentColor(hexColor);
    sendColorCommand(hexColor);
  };

  // Only updates local state (for picker dragging)
  const handlePickerChange = (hexColor: string) => {
    setCurrentColor(hexColor);
  };

  // Commits the current local state (for picker blur/close)
  const handlePickerCommit = () => {
    sendColorCommand(currentColor);
  };

  return (
    <div className="py-2 px-2 bg-background/30 rounded space-y-2">
      <span className="text-xs text-muted-foreground font-medium">{expose.label || 'Color'}</span>

      {/* Color palettes */}
      <div className="flex gap-1 flex-wrap">
        {pridePalette.map((color) => (
          <button
            key={color}
            onClick={() => handlePaletteClick(color)}
            className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform cursor-pointer"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="flex gap-1 flex-wrap">
        {whitePalette.map((color) => (
          <button
            key={color}
            onClick={() => handlePaletteClick(color)}
            className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform cursor-pointer"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Color picker - click to open browser's native color selector */}
      <div className="flex items-center gap-3 pt-1">
        <div className="relative w-12 h-12">
          <input
            type="color"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={currentColor}
            onChange={(e) => handlePickerChange(e.target.value)}
            onBlur={handlePickerCommit}
            title="Click to open color picker"
          />
          <div
            className="w-full h-full rounded-full border-4 border-border shadow-lg cursor-pointer hover:scale-105 transition-transform"
            style={{ backgroundColor: currentColor }}
          />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Current Color</div>
          <div className="text-xs font-mono font-bold text-foreground">{currentColor.toUpperCase()}</div>
        </div>
      </div>
    </div>
  );
}

// Composite feature with sub-features (switch, light, cover, lock, climate, fan)
export function CompositeFeature({ expose, onChange, data }: FeatureProps) {
  const features = expose.features || [];

  // Check if this is a color feature (color_xy or color_hs)
  const isColorFeature = expose.type === 'composite' &&
    (expose.name === 'color_xy' || expose.name === 'color_hs' || expose.name === 'color_rgb');

  // If it's a color feature, render ColorFeature instead
  // Color values (x, y) are nested under expose.property
  if (isColorFeature) {
    const colorData = expose.property && data?.[expose.property]
      ? data[expose.property] as Record<string, unknown>
      : data;

    return (
      <ColorFeature
        expose={expose}
        value={data?.[expose.property]}
        onChange={onChange}
        data={colorData}
      />
    );
  }

  // For composite features with a property, check if data is nested under that property
  // This is needed for types like 'light' where the composite has a property name
  // and sub-features (state, brightness, etc.) are nested under it
  const featureData = expose.property && data?.[expose.property]
    ? data[expose.property] as Record<string, unknown>
    : data;

  if (features.length === 0) {
    return <ValueDisplay expose={expose} value={data?.[expose.property]} />;
  }

  return (
    <div className="space-y-0.5">
      {features.map((subExpose) => (
        <Feature
          key={subExpose.property || subExpose.name}
          expose={subExpose}
          value={featureData?.[subExpose.property]}
          onChange={onChange}
          data={featureData}
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
    // Note: color_xy, color_hs, color_rgb are handled inside CompositeFeature
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
