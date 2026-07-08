import type { TokenType, BaseValue, ShadowValue } from '@destiny-ui/core';

interface ValueEditorProps {
  type: TokenType;
  value: BaseValue;
  onChange: (value: BaseValue) => void;
}

// ── Color Editor ─────────────────────────────────────────────────────────────

function ColorEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // value is 8-digit #RRGGBBAA
  const hex6 = value.length >= 7 ? value.slice(0, 7) : '#000000';
  const alpha = value.length === 9 ? value.slice(7, 9) : 'ff';

  function handlePickerChange(e: Event) {
    const newHex6 = (e.target as HTMLInputElement).value;
    onChange(newHex6 + alpha);
  }

  function handleTextChange(e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim();
    // Accept 6-digit or 8-digit hex
    if (/^#[0-9a-fA-F]{8}$/.test(raw)) {
      onChange(raw);
    } else if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      onChange(raw + 'ff');
    }
  }

  function handleAlphaChange(e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim();
    // Accept 2-digit hex alpha
    if (/^[0-9a-fA-F]{2}$/.test(raw)) {
      onChange(hex6 + raw);
    }
  }

  return (
    <div class="value-editor value-editor--color">
      <input
        type="color"
        class="value-editor__color-picker"
        value={hex6}
        onInput={handlePickerChange}
        aria-label="Color picker"
      />
      <input
        type="text"
        class="value-editor__text-input value-editor__text-input--mono"
        defaultValue={value}
        onBlur={handleTextChange}
        placeholder="#RRGGBBAA"
        maxLength={9}
        aria-label="Hex color value"
      />
      <label class="value-editor__alpha-label">
        Alpha
        <input
          type="text"
          class="value-editor__text-input value-editor__text-input--small value-editor__text-input--mono"
          defaultValue={alpha}
          onBlur={handleAlphaChange}
          maxLength={2}
          placeholder="ff"
          aria-label="Alpha hex (00-ff)"
        />
      </label>
    </div>
  );
}

// ── Number Editor ─────────────────────────────────────────────────────────────

function NumberEditor({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      class="value-editor value-editor__number-input"
      value={value}
      onInput={(e) => {
        const n = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(n)) onChange(n);
      }}
      aria-label="Numeric value"
    />
  );
}

// ── Text with Unit Editor ────────────────────────────────────────────────────

type UnitType = 'dimension' | 'duration' | 'fontSize' | 'letterSpacing';

const UNIT_SUFFIXES: Record<UnitType, string> = {
  dimension: 'px',
  duration: 'ms',
  fontSize: 'px',
  letterSpacing: 'em',
};

function TextWithUnitEditor({
  type,
  value,
  onChange,
}: {
  type: UnitType;
  value: string;
  onChange: (v: string) => void;
}) {
  const unit = UNIT_SUFFIXES[type];
  return (
    <div class="value-editor value-editor--with-unit">
      <input
        type="text"
        class="value-editor__text-input"
        defaultValue={value}
        onBlur={(e) => onChange((e.target as HTMLInputElement).value.trim())}
        aria-label={`${type} value`}
      />
      <span class="value-editor__unit" aria-hidden="true">{unit}</span>
    </div>
  );
}

// ── Shadow Editor ─────────────────────────────────────────────────────────────

function ShadowEditor({
  value,
  onChange,
}: {
  value: ShadowValue;
  onChange: (v: ShadowValue) => void;
}) {
  function field(
    label: string,
    key: keyof ShadowValue,
    type: 'text' | 'color' = 'text'
  ) {
    if (type === 'color') {
      const hex6 = value[key].length >= 7 ? value[key].slice(0, 7) : '#000000';
      const alpha = value[key].length === 9 ? value[key].slice(7, 9) : 'ff';
      return (
        <div class="shadow-field">
          <label class="value-editor__label">{label}</label>
          <div class="value-editor--color">
            <input
              type="color"
              class="value-editor__color-picker"
              value={hex6}
              onInput={(e) =>
                onChange({ ...value, [key]: (e.target as HTMLInputElement).value + alpha })
              }
              aria-label={`Shadow ${label}`}
            />
            <input
              type="text"
              class="value-editor__text-input value-editor__text-input--mono"
              defaultValue={value[key]}
              onBlur={(e) => {
                const raw = (e.target as HTMLInputElement).value.trim();
                if (/^#[0-9a-fA-F]{6,8}$/.test(raw)) {
                  const normalized = raw.length === 7 ? raw + 'ff' : raw;
                  onChange({ ...value, [key]: normalized });
                }
              }}
              placeholder="#RRGGBBAA"
              maxLength={9}
              aria-label={`Shadow ${label} hex`}
            />
          </div>
        </div>
      );
    }
    return (
      <div class="shadow-field">
        <label class="value-editor__label">{label}</label>
        <input
          type="text"
          class="value-editor__text-input"
          defaultValue={value[key]}
          onBlur={(e) =>
            onChange({ ...value, [key]: (e.target as HTMLInputElement).value.trim() })
          }
          aria-label={`Shadow ${label}`}
        />
      </div>
    );
  }

  return (
    <div class="value-editor value-editor--shadow">
      {field('Offset X', 'offsetX')}
      {field('Offset Y', 'offsetY')}
      {field('Blur', 'blur')}
      {field('Spread', 'spread')}
      {field('Color', 'color', 'color')}
    </div>
  );
}

// ── CubicBezier Editor ────────────────────────────────────────────────────────

function CubicBezierEditor({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const labels = ['x1', 'y1', 'x2', 'y2'];
  // x1 and y1 are clamped to [0,1]; x2 and y2 are unconstrained
  const mins = [0, 0, undefined, undefined];
  const maxs = [1, 1, undefined, undefined];

  return (
    <div class="value-editor value-editor--cubic-bezier">
      {labels.map((label, i) => (
        <div key={label} class="cubic-bezier-field">
          <label class="value-editor__label">{label}</label>
          <input
            type="number"
            class="value-editor__number-input"
            value={value[i] ?? 0}
            min={mins[i]}
            max={maxs[i]}
            step="0.01"
            onInput={(e) => {
              const n = parseFloat((e.target as HTMLInputElement).value);
              if (!isNaN(n)) {
                const next = [...value];
                next[i] = n;
                onChange(next);
              }
            }}
            aria-label={`Cubic bezier ${label}`}
          />
        </div>
      ))}
    </div>
  );
}

// ── FontFamily Editor ─────────────────────────────────────────────────────────

function FontFamilyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      class="value-editor value-editor__text-input value-editor__text-input--full"
      defaultValue={value}
      onBlur={(e) => onChange((e.target as HTMLInputElement).value.trim())}
      placeholder="Font family name"
      aria-label="Font family value"
    />
  );
}

// ── Main ValueEditor ──────────────────────────────────────────────────────────

export function ValueEditor({ type, value, onChange }: ValueEditorProps) {
  switch (type) {
    case 'color':
      return (
        <ColorEditor
          value={typeof value === 'string' ? value : '#000000ff'}
          onChange={onChange}
        />
      );

    case 'fontWeight':
    case 'lineHeight':
      return (
        <NumberEditor
          value={typeof value === 'number' ? value : 0}
          onChange={onChange}
        />
      );

    case 'dimension':
    case 'duration':
    case 'fontSize':
    case 'letterSpacing':
      return (
        <TextWithUnitEditor
          type={type}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
        />
      );

    case 'shadow':
      return (
        <ShadowEditor
          value={
            typeof value === 'object' && !Array.isArray(value)
              ? (value as ShadowValue)
              : { offsetX: '0px', offsetY: '0px', blur: '0px', spread: '0px', color: '#000000ff' }
          }
          onChange={onChange}
        />
      );

    case 'cubicBezier':
      return (
        <CubicBezierEditor
          value={Array.isArray(value) ? (value as number[]) : [0, 0, 0, 0]}
          onChange={onChange}
        />
      );

    case 'fontFamily':
      return (
        <FontFamilyEditor
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
        />
      );

    default:
      return <span class="value-editor__unsupported">Unsupported type: {type}</span>;
  }
}
