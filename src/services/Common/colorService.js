const NodeCache = require("node-cache");
const OpenAI = require("openai");
const { ProductVariant, ColorMapping } = require("../../models");
const settings = require("../../config/settings");

const cache = new NodeCache({
  stdTTL: 3600,
});

// Created on first use, and again when the key changes on the Settings page. Without a key
// this throws, which only disables AI color matching (callers catch it).
let openai = { key: null, client: null };
const getOpenAI = () => {
  const key = settings.getRequired("OPENAI_API_KEY");
  if (openai.key !== key) {
    openai = { key, client: new OpenAI({ apiKey: key }) };
  }
  return openai.client;
};

const BASIC_COLORS = {
  black: "#000000",
  "deep black": "#000000",

  white: "#FFFFFF",
  wht: "#FFFFFF",
  blanc: "#FFFFFF",

  silver: "#C0C0C0",

  grey: "#808080",
  gray: "#808080",
  "oxford grey": "#808080",
  "shadow grey": "#808080",
  "windsor grey": "#808080",

  charcoal: "#36454F",
  "char. gray": "#36454F",

  navy: "#001F54",
  "urban navy": "#1F3A5F",

  royal: "#4169E1",
  ryl: "#4169E1",

  blue: "#0000FF",

  red: "#FF0000",

  maroon: "#800000",

  orange: "#FF8C00",
  "zion orange": "#D96C2F",
  "n orange": "#FF8C00",
  "n. orange": "#FF8C00",

  green: "#008000",
  forest: "#228B22",

  olive: "#556B2F",
  "dk. ol. green": "#556B2F",
  "realtree edge": "#556B2F",

  purple: "#800080",

  gold: "#FFD700",

  yellow: "#FFFF00",

  brown: "#8B4513",
  "cargo brown": "#6F4E37",

  khaki: "#C3B091",

  pink: "#FFC0CB",

  lavender: "#E6E6FA",
  orchid: "#DA70D6",

  toast: "#C68642",

  denim: "#1560BD",

  hunter: "#355E3B",

  carolina: "#56A0D3",

  amethyst: "#9966CC",

  anthracite: "#383E42",

  aqua: "#00FFFF",

  sage: "#9CAF88",

  seafoam: "#93E9BE",

  bamboo: "#CDBA96",

  coral: "#FF7F50",

  teal: "#008080",

  turquoise: "#40E0D0",

  burgundy: "#800020",

  lime: "#32CD32",

  cream: "#FFFDD0",

  ivory: "#FFFFF0",

  tan: "#D2B48C",

  beige: "#F5F5DC",

  almond: "#EED9C4",

  cerulean: "#2A52BE",

  aluminum: "#A9A9A9",

  airforce: "#5D8AA8",

  admiral: "#273A5B",

  agave: "#87A96B",

  action: "#7CB342",

  adriatic: "#006994",

  aegean: "#4F84C4",

  airy: "#B9D9EB",

  amber: "#FFBF00",

  magnet: "#6E6E6E",

  heather: "#A9A9A9",

  antique: "#8B5A2B",

  cherry: "#D2042D",

  "cotton candy": "#FFBCD9",

  cork: "#C19A6B",

  "dusty rose": "#DCAE96",

  dune: "#C2B280",

  "hot pink": "#FF69B4",
  "light blue": "#ADD8E6",
  "metallic silver": "#C0C0C0",
  "metallic gold": "#FFD700",

  // Specific shades that must NOT collapse into their generic base color.
  "cornflower blue": "#6495ED",
  cornflower: "#6495ED",
  "cambridge blue": "#A3C1AD",
  "fluorescent blue": "#0FF0FC",
  "neon blue": "#0FF0FC",
  "royal blue": "#4169E1",
  "sky blue": "#87CEEB",
  "powder blue": "#B0E0E6",
  "cobalt blue": "#0047AB",
  "baby blue": "#89CFF0",
  "steel blue": "#4682B4",
  "midnight blue": "#191970",
  "electric blue": "#7DF9FF",

  // Green family
  "hunter green": "#355E3B",
  "forest green": "#228B22",
  "kelly green": "#4CBB17",
  "mint green": "#98FF98",
  "emerald green": "#50C878",
  "army green": "#4B5320",
  "olive green": "#556B2F",
  "lime green": "#32CD32",
  "sage green": "#9CAF88",
};

// Generic/base colors.
// These should NOT be used as partial matches for
// more specific color names such as "Cornflower Blue",
// and are also used to detect when the AI silently
// falls back to a generic shade for a specific name.
const GENERIC_COLOR_NAMES = new Set([
  "black",
  "white",
  "silver",
  "grey",
  "gray",
  "navy",
  "blue",
  "red",
  "maroon",
  "orange",
  "green",
  "purple",
  "gold",
  "yellow",
  "brown",
  "khaki",
  "pink",
  "lavender",
  "teal",
  "turquoise",
  "lime",
  "cream",
  "ivory",
  "tan",
  "beige",
]);

// The literal hex codes those generic names resolve to, so we can
// detect "AI returned a generic hex for a specific-sounding name".
const GENERIC_HEX_CODES = new Set(
  [...GENERIC_COLOR_NAMES].map((name) => BASIC_COLORS[name]).filter(Boolean),
);

const normalizeColor = (name) =>
  name
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s/-]/g, "") || "";

async function getOrCreateColorCode(
  supplier,
  rawColorName,
  forceRefresh = false,
) {
  try {
    if (!supplier || !rawColorName) {
      return "#CCCCCC";
    }

    const normalized = normalizeColor(rawColorName);

    let cleanedColor = normalized;

    if (supplier === "OTTOCAP") {
      cleanedColor = cleanedColor.replace(/^\d+\s*-\s*/, "");
    }

    const cacheKey = `${supplier}:${normalized}`;

    // ======================
    // CACHE
    // ======================

    const cached = cache.get(cacheKey);

    if (!forceRefresh && cached) {
      return cached;
    }

    // ======================
    // DB CHECK
    // ======================

    const existing = await ColorMapping.findOne({
      where: {
        supplier,
        normalized_color_name: normalized,
        is_active: true,
      },
    });

    if (
      !forceRefresh &&
      existing?.status === "approved" &&
      existing?.hex_code
    ) {
      cache.set(cacheKey, existing.hex_code);
      return existing.hex_code;
    }

    // ======================
    // BASIC COLOR MATCH
    // ======================

    const parts = cleanedColor
      .split("/")
      .map((x) =>
        x
          .toLowerCase()
          .replace(/\bseg\b/gi, "")
          .replace(/\bhot p\b/gi, "hot pink")
          .replace(/\blight blu\b/gi, "light blue")
          .replace(/\blt blu\b/gi, "light blue")
          .replace(/\blt blue\b/gi, "light blue")
          .replace(/\breflex\b/gi, "")
          .replace(/\bmetallic\b/gi, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);

    const matchedCodes = [];

    for (const part of parts) {
      // --------------------------------
      // 1. EXACT MATCH FIRST
      // --------------------------------

      const exactMatch = BASIC_COLORS[part];

      if (exactMatch) {
        matchedCodes.push(exactMatch);
        continue;
      }

      // --------------------------------
      // 2. PARTIAL MATCH
      // --------------------------------
      //
      // IMPORTANT:
      // Don't allow generic "blue", "green", "pink", etc.
      // to steal a more specific color name.
      //
      // Example:
      // "cornflower blue" should NOT become "#0000FF".
      // It should go to AI unless "cornflower blue"
      // exists explicitly in BASIC_COLORS.
      //

      const containsGenericColor = [...GENERIC_COLOR_NAMES].some(
        (genericColor) =>
          part.includes(` ${genericColor}`) ||
          part.startsWith(`${genericColor} `),
      );

      if (containsGenericColor) {
        continue;
      }

      // Match only specific aliases/names.
      const partialMatch = Object.entries(BASIC_COLORS)
        .filter(([key]) => !GENERIC_COLOR_NAMES.has(key))
        .sort(([a], [b]) => b.length - a.length)
        .find(([key]) => part.includes(key))?.[1];

      if (partialMatch) {
        matchedCodes.push(partialMatch);
      }
    }

    let hexCode = null;

    if (matchedCodes.length) {
      hexCode = [...new Set(matchedCodes)].slice(0, 3).join(",");

      console.log(`🎨 BASIC MATCH: ${rawColorName} -> ${hexCode}`);
    }

    // Tracks whether this color was a bare generic name to begin with
    // (e.g. just "Blue") or a multi-tone name (e.g. "Navy/White") —
    // in both of those cases a generic-looking hex is EXPECTED and
    // should not be flagged as suspect.
    const isMultiTone = cleanedColor.includes("/");
    const isBareGeneric = GENERIC_COLOR_NAMES.has(cleanedColor);
    let isSuspectMatch = false;

    // ======================
    // AI FALLBACK
    // ======================

    if (!hexCode) {
      console.log(`🤖 CALLING AI FOR COLOR: ${rawColorName}`);

      try {
        const response = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",

          messages: [
            {
              role: "system",

              content: `
You are an expert in apparel and textile colors.

Convert the supplied apparel color name into the most accurate
representative HEX color code.

IMPORTANT:
- Preserve the distinction between different shades.
- Do NOT convert every color containing "blue" to #0000FF.
- Do NOT convert every color containing "green" to #008000.
- Do NOT convert every color containing "pink" to #FFC0CB.
- Names such as Cornflower Blue, Cambridge Blue, Sky Blue,
  Powder Blue, Cobalt Blue, Forest Green, Mint Green,
  Hunter Green, Hot Pink, Dusty Rose, etc. must receive
  their own appropriate shade.
- Return 1 HEX code unless the name clearly represents
  multiple colors.
- Return ONLY the HEX code(s), separated by commas.
`,
            },

            {
              role: "user",

              content: `Color: ${rawColorName}`,
            },
          ],

          temperature: 0.1,

          max_tokens: 60,
        });

        const text = response.choices?.[0]?.message?.content?.trim();

        const matches = text?.match(/#[0-9A-Fa-f]{6}/g);

        if (matches?.length) {
          hexCode = [...new Set(matches)].slice(0, 3).join(",");

          console.log(`🎨 AI RESULT: ${rawColorName} -> ${hexCode}`);

          // Flag (but don't discard) results where the AI resolved a
          // specific-sounding name to a generic base hex — this is
          // exactly the "three blues all became #0000FF" bug.
          if (!isMultiTone && !isBareGeneric) {
            const codes = hexCode.split(",");
            isSuspectMatch = codes.some((code) =>
              GENERIC_HEX_CODES.has(code),
            );

            if (isSuspectMatch) {
              console.warn(
                `⚠️ SUSPECT GENERIC MATCH: "${rawColorName}" resolved to a generic hex (${hexCode}) — flagging for review`,
              );
            }
          }
        }
      } catch (err) {
        console.error(`❌ AI COLOR FAILED: ${rawColorName}`, err.message);
      }
    }

    if (!hexCode) {
      hexCode = "#CCCCCC";
    }

    // ======================
    // SAVE MAPPING
    // ======================

    const needsReview = hexCode === "#CCCCCC" || isSuspectMatch;

    await ColorMapping.upsert({
      supplier,

      raw_color_name: rawColorName,

      normalized_color_name: normalized,

      hex_code: hexCode,

      status: needsReview ? "pending" : "approved",

      notes: needsReview
        ? hexCode === "#CCCCCC"
          ? "Needs manual review"
          : "AI returned a generic base color for what looks like a specific shade — needs verification"
        : "Auto generated",
    });

    // ======================
    // UPDATE EXISTING
    // VARIANTS
    // ======================

    await ProductVariant.update(
      {
        color_code: hexCode,
      },
      {
        where: {
          supplier,
          color: rawColorName,
        },
      },
    );

    cache.set(cacheKey, hexCode);

    return hexCode;
  } catch (err) {
    console.error(`❌ COLOR SERVICE ERROR: ${rawColorName}`, err.message);

    return "#CCCCCC";
  }
}

module.exports = {
  getOrCreateColorCode,
};