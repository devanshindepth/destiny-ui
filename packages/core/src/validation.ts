import type {
  TokenType,
  TokenCategory,
  ValidationError,
  ShadowValue,
  TypographyValue,
  GradientValue,
  BorderValue,
} from './types.js';

// ─── Regex patterns ──────────────────────────────────────────────────────────

/** #RRGGBBAA — exactly 8 hex digits */
const COLOR_RE = /^#[0-9A-Fa-f]{8}$/;

/** e.g. "16px", "1.5rem", "0rem" */
const DIMENSION_RE = /^-?(\d+(\.\d+)?)(px|rem)$/;

/** px only — used for Breakpoints (req 6.6) */
const DIMENSION_PX_RE = /^-?(\d+(\.\d+)?)px$/;

/** e.g. "200ms", "0ms" */
const DURATION_RE = /^-?(\d+(\.\d+)?)ms$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function err(
  field: ValidationError['field'],
  message: string
): ValidationError {
  return { kind: 'validation', tokenId: '', field, message };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a #RRGGBBAA color string */
function validateColor(value: unknown): ValidationError | null {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) {
    return err(
      'value',
      `Color value must be an 8-digit hex string in the format #RRGGBBAA (e.g. "#FF5733FF"), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate a dimension string (px or rem) */
function validateDimension(value: unknown, pxOnly = false): ValidationError | null {
  if (typeof value !== 'string') {
    return err('value', `Dimension value must be a string, got: ${typeof value}`);
  }
  const pattern = pxOnly ? DIMENSION_PX_RE : DIMENSION_RE;
  const suffix = pxOnly ? '`px`' : '`px` or `rem`';
  if (!pattern.test(value)) {
    return err(
      'value',
      `Dimension value must be a number followed by ${suffix} (e.g. "16px"${pxOnly ? '' : ' or "1.5rem"'}), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate a duration string (ms suffix) */
function validateDuration(value: unknown): ValidationError | null {
  if (typeof value !== 'string' || !DURATION_RE.test(value)) {
    return err(
      'value',
      `Duration value must be a number followed by \`ms\` (e.g. "200ms"), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate a cubicBezier: array of exactly 4 numbers */
function validateCubicBezier(value: unknown): ValidationError | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n) => typeof n === 'number' && isFinite(n))
  ) {
    return err(
      'value',
      `cubicBezier value must be an array of exactly 4 finite numbers (e.g. [0.4, 0, 0.2, 1]), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate a composite shadow object */
function validateShadow(value: unknown): ValidationError | null {
  if (!isRecord(value)) {
    return err('value', `Shadow value must be an object with offsetX, offsetY, blur, spread, and color fields`);
  }

  const shadow = value as Partial<ShadowValue>;
  const dimensionFields: Array<keyof ShadowValue> = ['offsetX', 'offsetY', 'blur', 'spread'];

  for (const field of dimensionFields) {
    const fieldVal = shadow[field];
    if (fieldVal === undefined) return err('value', `Shadow value is missing required field "${field}"`);
    if (isRecord(fieldVal) && '$alias' in fieldVal) continue;
    const valErr = validateDimension(fieldVal);
    if (valErr) return err('value', `Shadow field "${field}" invalid: ${valErr.message}`);
  }

  if (shadow.color === undefined) return err('value', `Shadow value is missing required field "color"`);
  if (!(isRecord(shadow.color) && '$alias' in shadow.color)) {
     const cErr = validateColor(shadow.color);
     if (cErr) return err('value', `Shadow field "color" invalid: ${cErr.message}`);
  }

  return null;
}

function validateTypography(value: unknown): ValidationError | null {
  if (!isRecord(value)) return err('value', `Typography value must be an object`);
  const typo = value as Partial<TypographyValue>;
  
  if (typo.fontFamily === undefined) return err('value', 'Typography missing fontFamily');
  if (!(isRecord(typo.fontFamily) && '$alias' in typo.fontFamily)) {
    const e = validateFontFamily(typo.fontFamily);
    if (e) return err('value', `Typography fontFamily invalid: ${e.message}`);
  }

  if (typo.fontSize === undefined) return err('value', 'Typography missing fontSize');
  if (!(isRecord(typo.fontSize) && '$alias' in typo.fontSize)) {
    const e = validateFontSize(typo.fontSize);
    if (e) return err('value', `Typography fontSize invalid: ${e.message}`);
  }

  if (typo.fontWeight === undefined) return err('value', 'Typography missing fontWeight');
  if (!(isRecord(typo.fontWeight) && '$alias' in typo.fontWeight)) {
    const e = validateFontWeight(typo.fontWeight);
    if (e) return err('value', `Typography fontWeight invalid: ${e.message}`);
  }

  if (typo.lineHeight === undefined) return err('value', 'Typography missing lineHeight');
  if (!(isRecord(typo.lineHeight) && '$alias' in typo.lineHeight)) {
    const e = validateLineHeight(typo.lineHeight);
    if (e) return err('value', `Typography lineHeight invalid: ${e.message}`);
  }

  if (typo.letterSpacing === undefined) return err('value', 'Typography missing letterSpacing');
  if (!(isRecord(typo.letterSpacing) && '$alias' in typo.letterSpacing)) {
    const e = validateLetterSpacing(typo.letterSpacing);
    if (e) return err('value', `Typography letterSpacing invalid: ${e.message}`);
  }

  return null;
}

function validateGradient(value: unknown): ValidationError | null {
  if (!Array.isArray(value)) return err('value', `Gradient value must be an array of stops`);
  for (let i = 0; i < value.length; i++) {
    const stop = value[i];
    if (!isRecord(stop)) return err('value', `Gradient stop ${i} must be an object`);
    
    if (stop.color === undefined) return err('value', `Gradient stop ${i} missing color`);
    if (!(isRecord(stop.color) && '$alias' in stop.color)) {
      const e = validateColor(stop.color);
      if (e) return err('value', `Gradient stop ${i} color invalid: ${e.message}`);
    }

    if (stop.position === undefined) return err('value', `Gradient stop ${i} missing position`);
    if (!(isRecord(stop.position) && '$alias' in stop.position)) {
      if (typeof stop.position !== 'number' || stop.position < 0 || stop.position > 1) {
        return err('value', `Gradient stop ${i} position must be a number between 0 and 1`);
      }
    }
  }
  return null;
}

function validateBorder(value: unknown): ValidationError | null {
  if (!isRecord(value)) return err('value', `Border value must be an object`);
  const border = value as Partial<BorderValue>;

  if (border.color === undefined) return err('value', 'Border missing color');
  if (!(isRecord(border.color) && '$alias' in border.color)) {
    const e = validateColor(border.color);
    if (e) return err('value', `Border color invalid: ${e.message}`);
  }

  if (border.width === undefined) return err('value', 'Border missing width');
  if (!(isRecord(border.width) && '$alias' in border.width)) {
    const e = validateDimension(border.width);
    if (e) return err('value', `Border width invalid: ${e.message}`);
  }

  if (border.style === undefined) return err('value', 'Border missing style');
  if (!(isRecord(border.style) && '$alias' in border.style)) {
    if (typeof border.style !== 'string' || border.style.trim() === '') {
      return err('value', `Border style must be a non-empty string`);
    }
  }

  return null;
}

/** Validate fontFamily — must be a non-empty string */
function validateFontFamily(value: unknown): ValidationError | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return err(
      'value',
      `fontFamily value must be a non-empty string (e.g. "Inter, sans-serif"), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate fontSize — string with px or rem, or a non-empty string (e.g. "1em", "100%") */
function validateFontSize(value: unknown): ValidationError | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return err(
      'value',
      `fontSize value must be a non-empty string (e.g. "16px" or "1rem"), got: ${JSON.stringify(value)}`
    );
  }
  return null;
}

/** Validate fontWeight — number (e.g. 400, 700) or keyword string */
function validateFontWeight(value: unknown): ValidationError | null {
  if (typeof value === 'number' && isFinite(value) && value > 0) {
    return null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return null;
  }
  return err(
    'value',
    `fontWeight value must be a positive number (e.g. 400) or a non-empty string keyword (e.g. "bold"), got: ${JSON.stringify(value)}`
  );
}

/** Validate lineHeight — number (unitless ratio) or string */
function validateLineHeight(value: unknown): ValidationError | null {
  if (typeof value === 'number' && isFinite(value) && value >= 0) {
    return null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return null;
  }
  return err(
    'value',
    `lineHeight value must be a non-negative number (e.g. 1.5) or a non-empty string (e.g. "1.5rem"), got: ${JSON.stringify(value)}`
  );
}

/** Validate letterSpacing — string with px or rem, or zero */
function validateLetterSpacing(value: unknown): ValidationError | null {
  if (typeof value === 'number' && isFinite(value)) {
    return null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return null;
  }
  return err(
    'value',
    `letterSpacing value must be a finite number or a non-empty string (e.g. "0.05em" or "1px"), got: ${JSON.stringify(value)}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates a token value against the declared token type.
 *
 * Returns a {@link ValidationError} when the value does not conform,
 * or `null` if it is valid.  The returned error always has `tokenId: ''`;
 * callers should fill in the real token ID before surfacing the error.
 *
 * For `dimension` tokens in the `breakpoints` category, only the `px` suffix
 * is accepted (req 6.6).  Pass `category` to enforce that constraint.
 */
export function validateTokenValue(
  type: TokenType,
  value: unknown,
  category?: TokenCategory
): ValidationError | null {
  switch (type) {
    case 'color':
      return validateColor(value);

    case 'dimension': {
      // Breakpoints only allow px (req 6.6); all other categories allow px or rem (req 6.3)
      const pxOnly = category === 'breakpoints';
      return validateDimension(value, pxOnly);
    }

    case 'duration':
      return validateDuration(value);

    case 'cubicBezier':
      return validateCubicBezier(value);

    case 'shadow':
      return validateShadow(value);

    case 'typography':
      return validateTypography(value);

    case 'gradient':
      return validateGradient(value);

    case 'border':
      return validateBorder(value);

    case 'fontFamily':
      return validateFontFamily(value);

    case 'fontSize':
      return validateFontSize(value);

    case 'fontWeight':
      return validateFontWeight(value);

    case 'lineHeight':
      return validateLineHeight(value);

    case 'letterSpacing':
      return validateLetterSpacing(value);

    default: {
      // Exhaustiveness guard — TypeScript will flag this if a new type is added
      const _exhaustive: never = type;
      return err('type', `Unknown token type: ${String(_exhaustive)}`);
    }
  }
}

// ─── Token name validation ────────────────────────────────────────────────────

/** Allowed characters in a token name: letters, digits, hyphens, underscores */
const NAME_RE = /^[A-Za-z][A-Za-z0-9\-_.]*$/;

/**
 * Validates a token name for uniqueness and format.
 *
 * - `name`        — the human-readable label of the new token
 * - `existingIds` — array of token IDs already present in the graph
 * - `category`    — the Token_Category the new token will belong to
 *
 * Returns a {@link ValidationError} when the name is invalid or already in
 * use within the same category, or `null` if it is valid.
 */
export function validateTokenName(
  name: string,
  existingIds: string[],
  category: TokenCategory
): ValidationError | null {
  if (typeof name !== 'string' || name.trim() === '') {
    return {
      kind: 'validation',
      tokenId: '',
      field: 'name',
      message: 'Token name must be a non-empty string.',
    };
  }

  const trimmed = name.trim();

  if (!NAME_RE.test(trimmed)) {
    return {
      kind: 'validation',
      tokenId: '',
      field: 'name',
      message: `Token name "${trimmed}" is invalid. Names must start with a letter and contain only letters, digits, hyphens, underscores, or dots.`,
    };
  }

  // Build the dot-notation ID that this token would receive in this category
  // e.g. category="brand-colors", name="primary" → "color.brand.primary"
  // For uniqueness purposes we check whether the same name already appears
  // under this category prefix in existingIds (req 5.5).
  const categoryPrefix = category + '.';
  const duplicate = existingIds.some((id) => {
    // The last segment of the id corresponds to the name
    const segments = id.split('.');
    const lastName = segments[segments.length - 1];
    // Match within the same category
    return id.startsWith(categoryPrefix) && lastName === trimmed;
  });

  if (duplicate) {
    return {
      kind: 'validation',
      tokenId: '',
      field: 'name',
      message: `A token named "${trimmed}" already exists in the "${category}" category.`,
    };
  }

  return null;
}
