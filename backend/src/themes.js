/**
 * Luxury / premium residential theme presets.
 * Each preset has light + dark variants. Brand color stays consistent
 * across modes; surface/page/text tokens flip for nightside use.
 *
 * Tokens are RGB triplets so Tailwind alpha modifiers continue to work.
 */

// Shared dark-mode neutral set, slightly tinted per theme by overrides below
const DARK_BASE = {
  "page-bg":   "16 18 24",
  "surface":   "26 28 36",
  "surface-2": "32 34 44",
  "fg":        "232 232 238",
  "muted":     "162 165 180",
  "line":      "55 58 70",
};

const PRESETS = {
  onyx_gold: {
    name: "Onyx & Gold",
    tagline: "Black-tie elegance for marquee residences",
    description: "Ivory canvas, charcoal type, and signature gold leaf.",
    swatches: ["#f8f5ed", "#caa15b", "#1b1b1f"],
    light: {
      "brand-50":  "248 245 237",
      "brand-100": "234 219 178",
      "brand-500": "188 144 70",
      "brand-600": "157 117 50",
      "brand-700": "117 86 32",
      "accent":    "200 162 90",
      "page-bg":   "250 246 238",
      "surface":   "255 253 247",
      "surface-2": "246 241 230",
      "fg":        "30 32 38",
      "muted":     "108 99 84",
      "line":      "232 224 207",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "60 48 22",
      "brand-100": "118 88 36",
      "brand-500": "212 174 96",
      "brand-600": "188 144 70",
      "brand-700": "147 113 56",
      "accent":    "224 188 116",
      "page-bg":   "20 18 14",
      "surface":   "30 27 22",
      "surface-2": "38 33 26",
    },
  },

  marble_champagne: {
    name: "Marble & Champagne",
    tagline: "Light, airy, refined",
    description: "Soft marble whites with champagne and rosé warmth.",
    swatches: ["#f7f1ea", "#c79f80", "#4b3a31"],
    light: {
      "brand-50":  "247 240 234",
      "brand-100": "234 217 200",
      "brand-500": "192 142 110",
      "brand-600": "161 116 88",
      "brand-700": "120 86 64",
      "accent":    "204 168 137",
      "page-bg":   "250 245 240",
      "surface":   "255 252 248",
      "surface-2": "246 239 232",
      "fg":        "55 42 35",
      "muted":     "120 102 92",
      "line":      "232 220 208",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "65 48 38",
      "brand-100": "120 90 70",
      "brand-500": "214 168 134",
      "brand-600": "192 142 110",
      "brand-700": "150 110 84",
      "accent":    "226 188 158",
      "page-bg":   "26 22 20",
      "surface":   "36 30 26",
      "surface-2": "44 36 32",
    },
  },

  emerald_estate: {
    name: "Emerald Estate",
    tagline: "Country-club green with ivory and gold",
    description: "Deep emerald primary, brushed-gold accents.",
    swatches: ["#f3f4ee", "#cba350", "#0d4730"],
    light: {
      "brand-50":  "236 244 238",
      "brand-100": "194 222 200",
      "brand-500": "31 105 73",
      "brand-600": "22 79 56",
      "brand-700": "13 56 39",
      "accent":    "203 163 80",
      "page-bg":   "245 244 235",
      "surface":   "253 252 245",
      "surface-2": "242 240 226",
      "fg":        "26 40 32",
      "muted":     "95 100 80",
      "line":      "222 226 208",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "16 50 38",
      "brand-100": "30 90 64",
      "brand-500": "70 168 124",
      "brand-600": "44 132 92",
      "brand-700": "26 90 64",
      "accent":    "220 184 106",
      "page-bg":   "10 22 16",
      "surface":   "18 36 28",
      "surface-2": "24 46 34",
    },
  },

  sapphire_skyline: {
    name: "Sapphire Skyline",
    tagline: "Modern penthouse navy with silver shimmer",
    description: "Deep sapphire primary, cool silver accents.",
    swatches: ["#eef1f6", "#7d8b9d", "#0d2342"],
    light: {
      "brand-50":  "236 240 247",
      "brand-100": "199 213 233",
      "brand-500": "30 70 130",
      "brand-600": "20 52 100",
      "brand-700": "12 35 70",
      "accent":    "150 168 188",
      "page-bg":   "238 241 246",
      "surface":   "252 253 255",
      "surface-2": "238 242 248",
      "fg":        "24 32 50",
      "muted":     "92 105 124",
      "line":      "214 222 234",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "18 32 60",
      "brand-100": "30 56 100",
      "brand-500": "90 138 210",
      "brand-600": "58 108 184",
      "brand-700": "32 70 130",
      "accent":    "182 198 218",
      "page-bg":   "12 16 26",
      "surface":   "20 26 40",
      "surface-2": "26 34 50",
    },
  },

  royale_burgundy: {
    name: "Royale Burgundy",
    tagline: "Regal wine, ivory, and gold leaf",
    description: "Warm ivory base, burgundy primary, gold accent.",
    swatches: ["#f8f1ea", "#bb8442", "#5e1428"],
    light: {
      "brand-50":  "248 235 230",
      "brand-100": "232 197 192",
      "brand-500": "139 36 56",
      "brand-600": "108 24 42",
      "brand-700": "76 16 30",
      "accent":    "187 132 66",
      "page-bg":   "250 244 236",
      "surface":   "255 252 248",
      "surface-2": "246 235 226",
      "fg":        "60 30 32",
      "muted":     "120 92 80",
      "line":      "236 218 210",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "60 18 26",
      "brand-100": "110 30 50",
      "brand-500": "196 80 100",
      "brand-600": "158 56 78",
      "brand-700": "118 36 56",
      "accent":    "214 166 100",
      "page-bg":   "22 14 16",
      "surface":   "36 22 26",
      "surface-2": "44 28 32",
    },
  },

  obsidian_pearl: {
    name: "Obsidian Pearl",
    tagline: "Modern minimalist with pearl + slate",
    description: "Cool pearl ivory with deep obsidian accents.",
    swatches: ["#f2f2f4", "#a0a4ad", "#1f2128"],
    light: {
      "brand-50":  "240 240 244",
      "brand-100": "212 215 224",
      "brand-500": "55 60 78",
      "brand-600": "40 44 60",
      "brand-700": "26 30 42",
      "accent":    "170 175 188",
      "page-bg":   "242 243 246",
      "surface":   "253 253 254",
      "surface-2": "238 240 246",
      "fg":        "26 30 42",
      "muted":     "100 105 120",
      "line":      "220 224 234",
    },
    dark: {
      ...DARK_BASE,
      "brand-50":  "40 44 60",
      "brand-100": "70 76 96",
      "brand-500": "180 188 210",
      "brand-600": "150 158 184",
      "brand-700": "120 128 154",
      "accent":    "200 204 218",
      "page-bg":   "12 14 22",
      "surface":   "22 26 36",
      "surface-2": "30 34 46",
    },
  },
};

const DEFAULT_KEY = "onyx_gold";

function publicList() {
  return Object.entries(PRESETS).map(([key, p]) => ({
    key,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    swatches: p.swatches,
    light_tokens: p.light,
    dark_tokens: p.dark,
  }));
}

function resolveTheme(themeKey, themeCustom) {
  const key = themeKey && PRESETS[themeKey] ? themeKey : DEFAULT_KEY;
  const preset = PRESETS[key];
  let custom = null;
  if (themeCustom) {
    try { custom = typeof themeCustom === "string" ? JSON.parse(themeCustom) : themeCustom; }
    catch { custom = null; }
  }
  // custom can be { light: {...}, dark: {...} } or flat (assumed light)
  const customLight = custom?.light || (custom && !custom.dark ? custom : null);
  const customDark = custom?.dark || null;
  return {
    key,
    name: preset.name,
    tagline: preset.tagline,
    description: preset.description,
    swatches: preset.swatches,
    light_tokens: { ...preset.light, ...(customLight || {}) },
    dark_tokens:  { ...preset.dark,  ...(customDark  || {}) },
    custom_overrides: custom || null,
  };
}

module.exports = { PRESETS, DEFAULT_KEY, publicList, resolveTheme };
