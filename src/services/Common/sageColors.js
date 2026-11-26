// The colours of a SAGE product, worked out from SAGE's answer alone. No database here, so
// the import, the sync, the admin API and the checks all build the colours the same way.
//
// SAGE's product detail (serviceId 105) names a product's colours twice:
//   colors  one comma-separated text, cut at 1,000 characters. Long lists are abbreviated
//           ("Hot P" for Hot Pink, "Red/P Seg"), the last name can be cut mid-word ("Wh"),
//           and some texts repeat a colour or hold a placeholder ("Various", "Unavailable").
//   skus    the supplier's stock list: one entry per colour (and size), with its stock.
//           In `attributes`, typeId 10 is the colour, 11 the size and 99 anything else.
// So the colours come from the stock list when SAGE sends one. The text gives the spelling
// the shop already shows (a colour isn't renamed because the stock list writes it "GREY")
// and the colours the stock list lacks; those stay on sale with their stock not tracked.

const crypto = require("crypto");

const TEXT_LIMIT = 1000; // SAGE cuts the colour text at this many characters
const COLOR_TYPE_ID = 10; // the colour attribute of a sku
const SIZE_TYPE_ID = 11; // the size (or model) attribute of a sku; 99 is anything else
const SKU_MAX_LENGTH = 100; // product_variants.sku is VARCHAR(100)

// Words that only name a colour's family: the text's "Navy Blue" is the stock list's "Navy".
const FAMILY_WORDS = new Set([
  "black",
  "white",
  "grey",
  "blue",
  "navy",
  "green",
  "red",
  "pink",
  "purple",
  "yellow",
  "orange",
  "brown",
  "beige",
  "tan",
  "gold",
  "silver",
]);

// The hue a colour word stands for. A family word after a name of the same hue is the same
// colour ("Navy Blue" is Navy); after a name of another hue it's another colour ("Red Orange"
// isn't Red, "Rose Gold" isn't Rose).
const HUE_OF = new Map([
  ["black", "black"],
  ["white", "white"],
  ["ivory", "white"],
  ["cream", "white"],
  ["grey", "grey"],
  ["silver", "grey"],
  ["charcoal", "grey"],
  ["graphite", "grey"],
  ["slate", "grey"],
  ["blue", "blue"],
  ["navy", "blue"],
  ["royal", "blue"],
  ["cobalt", "blue"],
  ["sky", "blue"],
  ["green", "green"],
  ["kelly", "green"],
  ["hunter", "green"],
  ["forest", "green"],
  ["olive", "green"],
  ["lime", "green"],
  ["red", "red"],
  ["cherry", "red"],
  ["crimson", "red"],
  ["burgundy", "red"],
  ["maroon", "red"],
  ["pink", "pink"],
  ["rose", "pink"],
  ["purple", "purple"],
  ["yellow", "yellow"],
  ["gold", "yellow"],
  ["orange", "orange"],
  ["brown", "brown"],
  ["beige", "brown"],
  ["tan", "brown"],
]);

// Kept in capitals when a capitalised name from the stock list is shown in title case.
const KEEP_UPPER = new Set(["PMS", "USA", "UV", "LED", "II", "III", "RPET", "RFID", "USB", "XL"]);

// Text entries that aren't colours.
const PLACEHOLDER = /^(various|unavail[a-z]*)$/i;

// Some suppliers keep parts and shapes in the stock list's colour field: the custom buttons'
// "Mylar", "Shells", "Pinned Backs (C)", "Magnet (C)"; badge holders' "Clip", "Armband W Cord";
// the breakaway wristbands' "Metal Bulldog", "Plastic Buckle", "Bad"; mouse pads' "Gaming",
// "Round". A stock list name with one of these words, or under 3 letters ("W", "(C)"), isn't a
// colour, so it's never added as one. Checked on all 594 live SAGE products (26 Nov 2026): this
// skips 226 such entries on 32 products and no colour.
const PART_WORDS = new Set([
  "back",
  "backs",
  "bad",
  "armband",
  "buckle",
  "bulldog",
  "chain",
  "chains",
  "clasp",
  "claw",
  "clip",
  "clips",
  "collets",
  "cord",
  "gaming",
  "hook",
  "hooks",
  "jhook",
  "loop",
  "magnet",
  "magnetic",
  "magnets",
  "metal",
  "mylar",
  "opener",
  "pin",
  "pinned",
  "pins",
  "plastic",
  "rectangular",
  "reel",
  "reels",
  "ring",
  "round",
  "shell",
  "shells",
  "slot",
  "square",
  "swivel",
  "tab",
  "tabs",
  "unpinned",
  "zip",
]);

// Some stock lists name the part in the size field instead ("CLEAR" / "DOUBLE CLUTCH" on name
// badges): such a sku is a fastener's stock, not a colour's.
const SIZE_PART = /\b(pinbacks?|clutch|magnets?|clips?|bulldog|adhesive|strap)\b/i;
const isPartName = (name) => {
  const words = foldAccents(clean(name)).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.join("").length < 3 || words.some((word) => PART_WORDS.has(word));
};

// SAGE sends onHand as a number, or null when the supplier doesn't share stock levels.
const isStockReported = (onHand) =>
  onHand !== null && onHand !== undefined && onHand !== "" && Number.isFinite(Number(onHand));

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// Accents removed, as MariaDB's utf8mb4_general_ci ignores them when it compares text. It also
// counts these letters as their plain ones.
const FOLDED_LETTERS = { ß: "s", ø: "o", Ø: "O", ł: "l", Ł: "L", ı: "i", ſ: "s" };
const foldAccents = (value) =>
  value
    .normalize("NFC")
    .replace(/[ßøØłŁıſ]/g, (letter) => FOLDED_LETTERS[letter])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// One key per colour whatever the spelling: case, accents and spacing ignored, "/", "&" and
// "and" the same separator, and "gray" the same as "grey".
const colorKey = (name) =>
  foldAccents(clean(name))
    .toLowerCase()
    .replace(/\s*(\/|&|\band\b)\s*/g, "/")
    .replace(/\bgray\b/g, "grey");

// Skus as the database's unique index compares them: case, accents and trailing spaces ignored
// (spaces only: a trailing tab still counts).
const skuKey = (sku) =>
  foldAccents(String(sku ?? ""))
    .toLowerCase()
    .replace(/ +$/, "");

// A name as its "/" parts, each a list of words: "Red/Hot Pink Seg" -> [["red"], ["hot", "pink", "seg"]].
const partsOf = (name) =>
  colorKey(name)
    .split("/")
    .map((part) => part.split(" ").filter(Boolean));

// "Hot P" for "Hot Pink", "White/Lime Green Se" for "White/Lime Green Seg": the same parts and
// words, each shortened word one or two letters long and the start of the full name's word. A
// whole word isn't an abbreviation of a longer one: "Red" isn't "Redwood", "Tan" isn't "Tangerine".
const MAX_ABBREVIATED_LETTERS = 2;
const isAbbreviation = (short, full) => {
  if (!clean(short) || !clean(full) || colorKey(short) === colorKey(full)) return false;
  const a = partsOf(short);
  const b = partsOf(full);
  if (a.length !== b.length) return false;
  return a.every(
    (words, i) =>
      words.length === b[i].length &&
      words.every(
        (word, k) =>
          word === b[i][k] || (word.length <= MAX_ABBREVIATED_LETTERS && b[i][k].startsWith(word)),
      ),
  );
};

// "Navy Blue" for "Navy", "Olive Green/Pale Pink" for "Olive and Pale Pink": in each "/" part,
// one name is the other followed by colour-family words. When the shorter name already ends in
// a hue, the added words must be that hue: "Navy Blue" is Navy, but "Red Orange" isn't Red.
const isFamilyVariant = (x, y) => {
  if (!clean(x) || !clean(y) || colorKey(x) === colorKey(y)) return false;
  const a = partsOf(x);
  const b = partsOf(y);
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    if (p.join(" ") === q.join(" ")) return true;
    const [long, short] = p.length > q.length ? [p, q] : [q, p];
    if (!short.length || long.length === short.length) return false;
    const added = long.slice(short.length);
    const hue = HUE_OF.get(short[short.length - 1]);
    return (
      short.every((word, k) => long[k] === word) &&
      added.every((word) => FAMILY_WORDS.has(word) && (!hue || HUE_OF.get(word) === hue))
    );
  });
};

// The stock list sometimes writes a name in capitals ("HOT PINK", even "GRaY"); the shop shows
// "Hot Pink" and "Gray". Mixed names such as "OD Green" are left as they are, and so are codes:
// words of one or two letters, and short bracketed ones ("(ZZ)", "(IMP)"). A separator at either
// end ("/BLACK BOTTOM") is dropped.
const isMostlyCaps = (name) =>
  (name.match(/\p{Lu}/gu) || []).length > (name.match(/\p{Ll}/gu) || []).length;
const displayName = (name) => {
  const text = clean(clean(name).replace(/^[\s/&,-]+|[\s/&,-]+$/g, ""));
  if (!isMostlyCaps(text)) return text;
  return text.replace(/\p{L}+/gu, (word, at) => {
    const bracketedCode = text[at - 1] === "(" && text[at + word.length] === ")" && word.length <= 4;
    if (KEEP_UPPER.has(word) || word.length <= 2 || bracketedCode) return word;
    return word[0] + word.slice(1).toLowerCase();
  });
};

// The colours of SAGE's stock list in its order, one per colour (a colour has one sku per
// size), with the stock of its skus added up, and how many sizes or models the list covers.
const stockListColors = (skus) => {
  const list = [];
  const byKey = new Map();
  const sizes = new Set();
  for (const sku of Array.isArray(skus) ? skus : []) {
    const attributes = Array.isArray(sku?.attributes) ? sku.attributes : [];
    const name = clean(attributes.find((a) => Number(a?.typeId) === COLOR_TYPE_ID)?.value);
    const size = clean(attributes.find((a) => Number(a?.typeId) === SIZE_TYPE_ID)?.value);
    if (!name) continue;
    // A fastener's stock, not a colour's: the part is named in the size field.
    if (SIZE_PART.test(size)) continue;
    if (size) sizes.add(size.toLowerCase());
    const key = colorKey(name);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { sageName: name, onHand: 0, reported: false, unlimited: false };
      byKey.set(key, entry);
      list.push(entry);
    }
    // Made to order: SAGE marks it unlimited (with onHand 0) and there's no stock limit.
    if (sku.unlimited) entry.unlimited = true;
    if (isStockReported(sku.onHand)) {
      // An oversold size (below 0) counts as none, so it can't cancel another size's stock.
      entry.onHand += Math.max(0, Number(sku.onHand));
      entry.reported = true;
    }
  }
  return { colors: list, sizeCount: sizes.size };
};

// A colour's stock is tracked only when SAGE reports a number for it and it isn't made to order.
const stockListStock = (entry) =>
  entry.unlimited || !entry.reported
    ? { stock: null, trackInventory: false }
    : { stock: entry.onHand, trackInventory: true };

// Without a stock list, every colour gets the product's stock, as the import always did (an
// oversold total, below 0, as none).
const productStock = (onHand) =>
  isStockReported(onHand)
    ? { stock: Math.max(0, Number(onHand)), trackInventory: true }
    : { stock: null, trackInventory: false };

// "Soccer" for "Soccer ball", "Stormy Skies Various" for "Stormy Skies", "Red" for "Tag Red":
// every word of one name is in the other (leaving out "various" and brackets), and the other's
// extra words name no colour or shade ("Black" isn't "Black Cherry", "Blue" isn't "Navy Blue"
// or "Light Blue", "Gold" isn't "Athletic Gold").
const NOISE_WORDS = new Set(["various"]);
const SHADE_WORDS = new Set([
  "athletic",
  "baby",
  "bright",
  "dark",
  "deep",
  "fluorescent",
  "hot",
  "light",
  "neon",
  "pale",
  "pastel",
]);
const plainWords = (name) =>
  colorKey(name)
    .replace(/[()[\].,]/g, " ")
    .split(/[\s/]+/)
    .filter((word) => word && !NOISE_WORDS.has(word));
const isContained = (x, y) => {
  if (!clean(x) || !clean(y) || colorKey(x) === colorKey(y)) return false;
  const a = plainWords(x);
  const b = plainWords(y);
  if (!a.length || !b.length) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  if (!small.every((word) => big.includes(word))) return false;
  return big
    .filter((word) => !small.includes(word))
    .every((word) => !FAMILY_WORDS.has(word) && !HUE_OF.has(word) && !SHADE_WORDS.has(word));
};

// The text paired with the stock list, surest match first. A text entry pairs with one stock
// list colour at most, and the other way round. Exact and normalized names fit one colour at
// most (the stock list has one colour per key). The looser matches pair only when it's the one
// fit both ways: the text entry fits that colour alone, and no other text entry fits it.
const PAIRINGS = [
  ["exact", (entry, sku) => entry === sku.sageName],
  ["normalized", (entry, sku) => colorKey(entry) === colorKey(sku.sageName)],
  ["abbreviation", (entry, sku) => isAbbreviation(entry, sku.sageName)],
  ["family", (entry, sku) => isFamilyVariant(entry, sku.sageName)],
  ["contains", (entry, sku) => isContained(entry, sku.sageName)],
];
const LOOSE_PAIRINGS = new Set(["abbreviation", "family", "contains"]);

// lineWide   the stock list covers several sizes or models (some suppliers send one list for a
//            whole product line), so a colour only it names may be another item's
// textStock  the stock of a colour only the text names
const fromStockList = (text, textCut, stockList, { lineWide = false, textStock } = {}) => {
  const pairOf = new Map(); // text index -> stock list colour
  const matchOf = new Map(); // text index -> how they were paired
  const taken = new Set(); // stock list colours already paired
  const pairedKeys = new Set(); // colour keys of the text entries already paired
  const isFree = (k) => !pairOf.has(k) && !pairedKeys.has(colorKey(text[k]));

  for (const [match, pairs] of PAIRINGS) {
    text.forEach((entry, i) => {
      // A text entry repeating one that's already paired is the same colour again, not
      // another one, so it never takes a second stock list colour.
      if (!isFree(i)) return;
      const candidates = stockList.filter((sku) => !taken.has(sku) && pairs(entry, sku));
      if (candidates.length !== 1) return;
      if (LOOSE_PAIRINGS.has(match)) {
        const rivals = new Set();
        text.forEach((other, k) => {
          if (k !== i && isFree(k) && colorKey(other) !== colorKey(entry) && pairs(other, candidates[0])) {
            rivals.add(colorKey(other));
          }
        });
        if (rivals.size) return;
      }
      pairOf.set(i, candidates[0]);
      matchOf.set(i, match);
      taken.add(candidates[0]);
      pairedKeys.add(colorKey(entry));
    });
  }

  // Text entries the stock list doesn't have: kept on sale unless they aren't a usable colour.
  // A repeat is the same colour as an entry already used: the same key as any of them, a family
  // name of one the stock list confirms ("Bermuda Blue" next to "Bermuda"), or its abbreviation.
  // A family name of a colour only the text has isn't a repeat: "Rose Gold" next to "Rose" is
  // another colour.
  const paired = [...pairOf.keys()].map((i) => text[i]);
  const usedKeys = new Set(paired.map(colorKey));
  const textOnly = [];
  const placeholders = [];
  const dropped = [];
  text.forEach((entry, i) => {
    if (pairOf.has(i)) return;
    if (textCut && i === text.length - 1) {
      // The text was cut at 1,000 characters, so its last name may be a fragment ("Wh").
      dropped.push({ name: entry, reason: "cut_off" });
    } else if (
      usedKeys.has(colorKey(entry)) ||
      paired.some((u) => isFamilyVariant(u, entry) || isAbbreviation(entry, u))
    ) {
      dropped.push({ name: entry, reason: "duplicate" });
    } else if (PLACEHOLDER.test(entry)) {
      usedKeys.add(colorKey(entry));
      placeholders.push(entry);
    } else {
      usedKeys.add(colorKey(entry));
      textOnly.push(entry);
    }
  });

  const textIndexOf = new Map([...pairOf].map(([i, sku]) => [sku, i]));
  const colors = [];
  for (const sku of stockList) {
    const i = textIndexOf.get(sku);
    const match = i === undefined ? "sku_only" : matchOf.get(i);
    // A colour only the stock list names is added when it's a colour of this product. One the
    // text names too is already a colour of the shop, so it stays.
    if (match === "sku_only") {
      // A part or shape, not a colour.
      if (isPartName(sku.sageName)) {
        dropped.push({ name: sku.sageName, reason: "part" });
        continue;
      }
      // The list covers several sizes or models, so it may be another item's colour; unless the
      // colour text was cut off, in which case the list is the only way to its missing colours.
      if (lineWide && !textCut) {
        dropped.push({ name: sku.sageName, reason: "other_item" });
        continue;
      }
    }
    // The text's spelling is the one the shop already shows, unless the text abbreviated it.
    const name = match === "sku_only" || match === "abbreviation" ? displayName(sku.sageName) : text[i];
    colors.push({
      name,
      sageName: sku.sageName,
      listedAs: i === undefined ? null : text[i],
      status: "offered",
      match,
      ...stockListStock(sku),
    });
  }
  // A placeholder ("Various") goes when real colours take its place. When the stock list holds
  // only parts (the custom buttons), it's the product's one option and stays, as before.
  const kept = colors.length || textOnly.length ? [] : placeholders;
  for (const entry of placeholders) {
    if (!kept.includes(entry)) dropped.push({ name: entry, reason: "placeholder" });
  }
  for (const entry of [...textOnly, ...kept]) {
    // No stock record at SAGE for this colour: it keeps the product's stock, as before.
    colors.push({
      name: entry,
      sageName: null,
      listedAs: entry,
      status: "text_only",
      match: "text_only",
      ...textStock,
    });
  }

  // No two colours may share a key (one sku each): a tidied stock list name could meet another.
  const seen = new Set();
  const unique = [];
  for (const color of colors) {
    const key = colorKey(color.name);
    if (seen.has(key)) {
      dropped.push({ name: color.sageName || color.name, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    unique.push(color);
  }
  return { source: "skus", textCut, colors: unique, dropped };
};

// No stock list: the colours are the text's, each once. Placeholders stay, as nothing else
// names the product's colour then.
const fromColorText = (text, textCut, onHand) => {
  const colors = [];
  const dropped = [];
  const seen = new Set();
  text.forEach((entry, i) => {
    const key = colorKey(entry);
    if (textCut && i === text.length - 1) {
      dropped.push({ name: entry, reason: "cut_off" });
    } else if (seen.has(key)) {
      dropped.push({ name: entry, reason: "duplicate" });
    } else {
      seen.add(key);
      colors.push({
        name: entry,
        sageName: null,
        listedAs: entry,
        status: "text",
        match: null,
        ...productStock(onHand),
      });
    }
  });
  return { source: "text", textCut, colors, dropped };
};

// The colours a SAGE product is imported with: { source, textCut, colors, dropped }.
//   source   "skus" (from SAGE's stock list), "text" (no stock list colours: from the colour
//            text) or "none" (neither: one "Default" colour, as the import always did)
//   textCut  the colour text reached SAGE's 1,000 character limit
//   colors   stock list colours in SAGE's order, then colours only the text names, in its
//            order: { name, sageName, listedAs, status, match, stock, trackInventory }
//            status  offered | text_only | text | default
//            match   (stock list products) exact | normalized | abbreviation | family |
//                    contains | sku_only | text_only
//            stock   from the stock list for offered colours; text_only colours keep the
//                    product's stock, as every colour had before (not tracked when the product
//                    is made to order)
//   dropped  entries not imported: { name, reason }. From the text: cut_off | duplicate |
//            placeholder; from the stock list: part (a part or shape, not a colour) |
//            other_item (only a list covering several sizes or models names it)
// No two colours share a colour key. Only SAGE's own fields are read (colors, skus, onHand),
// so a `sageColors` key already on the object changes nothing.
const buildSageColorList = (sageProduct) => {
  const product = sageProduct || {};
  const rawText = String(product.colors ?? "");
  const textCut = rawText.length >= TEXT_LIMIT;
  const text = rawText.split(",").map(clean).filter(Boolean);

  const { colors: stockList, sizeCount } = stockListColors(product.skus);
  // Entries of the stock list that aren't imported, listed whichever way the colours come.
  let notImported = [];
  if (stockList.length) {
    const fromSkus = fromStockList(text, textCut, stockList, {
      lineWide: sizeCount > 1,
      textStock: stockList.some((entry) => entry.unlimited)
        ? { stock: null, trackInventory: false }
        : productStock(product.onHand),
    });
    if (fromSkus.colors.length) return fromSkus;
    // Nothing usable in the stock list and no colour in the text: built as if there were no
    // stock list, so an empty list never retires the product's variants.
    notImported = fromSkus.dropped.filter((entry) => entry.reason === "part" || entry.reason === "other_item");
  }
  const parts = notImported;

  const fromText = fromColorText(text, textCut, product.onHand);
  if (fromText.colors.length) return { ...fromText, dropped: [...fromText.dropped, ...parts] };

  return {
    source: "none",
    textCut,
    colors: [
      {
        name: "Default",
        sageName: null,
        listedAs: null,
        status: "default",
        match: null,
        ...productStock(product.onHand),
      },
    ],
    dropped: [...fromText.dropped, ...parts],
  };
};

// The start of every variant sku of a SAGE product, as the import has always built it.
const sageSkuPrefix = (sageProduct) => {
  const { itemNum, spc, prodEid } = sageProduct || {};
  return itemNum || spc || `SAGE-${prodEid}`;
};

// A variant's sku: "<prefix>-<colour>". product_variants.sku holds 100 characters, so a longer
// one is shortened and ends in "~" and 6 characters of the colour name's sha1, which keeps it
// unique.
const sageVariantSku = (prefix, name) => {
  const sku = `${prefix}-${name}`;
  const chars = Array.from(sku);
  if (chars.length <= SKU_MAX_LENGTH) return sku;
  const hash = crypto.createHash("sha1").update(String(name)).digest("hex").slice(0, 6);
  return `${chars
    .slice(0, SKU_MAX_LENGTH - hash.length - 1)
    .join("")
    .trimEnd()}~${hash}`;
};

// The picture SAGE captions with the colour's name. A caption may name it as the shop does,
// as SAGE's stock list does or as the colour text does ("Hot P"); `names` are tried in order.
const findColorPic = (pics, names) => {
  const list = Array.isArray(pics) ? pics : [];
  for (const name of names) {
    const wanted = String(name ?? "").trim().toLowerCase();
    if (!wanted) continue;
    const pic = list.find((p) => p?.caption && String(p.caption).trim().toLowerCase() === wanted);
    if (pic) return pic;
  }
  return null;
};

// How an existing variant that isn't on a colour's sku yet may still be that colour, surest
// first. Each looks at the variant's colour and the colour's name, stock list name and text entry.
// A rename keeps the variant's id, and order pages read its colour and sku live, so a wrong one
// would rewrite past orders: a loose match ("loose") is used only when it's the one fit both ways,
// and a family name ("Navy" / "Navy Blue") is never enough. Retiring one variant and creating the
// other is the safe way round then.
const RENAME_MATCHES = [
  ["same colour", (variant, row) => colorKey(variant.color) === colorKey(row.name)],
  ["listed as", (variant, row) => row.listedAs != null && variant.color === row.listedAs],
  [
    "SAGE's name",
    (variant, row) => row.sageName != null && colorKey(variant.color) === colorKey(row.sageName),
  ],
  [
    "abbreviation",
    (variant, row) =>
      isAbbreviation(variant.color, row.name) ||
      (row.sageName != null && isAbbreviation(variant.color, row.sageName)),
    "loose",
  ],
];

// What a save does with the product's variant rows, worked out before anything is written.
// Input:
//   colors             the colours (buildSageColorList), each may carry its `colorCode`
//   existing           this product's variant rows, removed ones too: { id, sku, color, deletedAt }
//   prefix, prodEid    the sku prefix (sageSkuPrefix) and SAGE's product id
//   skusHeldElsewhere  skus other products' rows hold (removed rows too), any case
//   source             buildSageColorList's source ("none" retires nothing)
// Output:
//   rows       one per colour: the colour plus `color`, `sku`, `variantId` and `action`
//              (update: a live row has the sku; rename: an existing variant is renamed to it;
//              restore: a removed row of this product has it, restoreListedVariants brings it
//              back; create: a new row; conflict: another product holds even the fallback sku)
//   renames    variants renamed in place: { id, fromColor, fromSku, toColor, toSku, colorCode, via }
//   retireIds  live variants no colour uses any more
//   notes      skus another product holds, renames that couldn't be made
const planSageVariants = ({
  colors = [],
  existing = [],
  prefix,
  prodEid,
  skusHeldElsewhere = [],
  source,
} = {}) => {
  const notes = [];
  const heldElsewhere = new Set(Array.from(skusHeldElsewhere || [], skuKey));
  const isRemoved = (variant) => Boolean(variant.deletedAt || variant.deleted_at);
  const live = existing.filter((variant) => !isRemoved(variant));
  const removedBySku = new Map(
    existing.filter(isRemoved).map((variant) => [skuKey(variant.sku), variant]),
  );

  // Each colour's sku. Two SAGE products can share an item number: a sku another product's row
  // holds is never written here (the upsert would overwrite that row), so this product's SAGE
  // id goes into the sku instead.
  const rows = colors.map((color) => {
    let sku = sageVariantSku(prefix, color.name);
    if (heldElsewhere.has(skuKey(sku))) {
      const ownSku = sageVariantSku(`${prefix}-${prodEid}`, color.name);
      notes.push(`"${color.name}": ${sku} belongs to another product, so this one uses ${ownSku}`);
      sku = ownSku;
    }
    return { ...color, color: color.name, sku, variantId: null, action: null };
  });

  // A variant already on a colour's sku stays as it is.
  const variantOf = new Map(); // row -> the live variant it's saved on
  const placed = new Set(); // ids of live variants given to a colour, or held back (below)
  const liveBySku = new Map(live.map((variant) => [skuKey(variant.sku), variant]));
  for (const row of rows) {
    const variant = liveBySku.get(skuKey(row.sku));
    if (variant && !placed.has(variant.id)) {
      variantOf.set(row, variant);
      placed.add(variant.id);
    }
  }

  // Other live variants that are one of the colours are renamed in place (same id, new name and
  // sku), so carts, wishlists and orders that point at them keep working. Surest match first,
  // across all colours, so a loose match never takes a variant a surer one wants; among several,
  // the oldest variant (lowest id).
  const renames = [];
  const settled = new Set(); // colours whose sku another row already holds
  for (const [via, matches, loose] of RENAME_MATCHES) {
    const isOpen = (row) => !variantOf.has(row) && !settled.has(row);
    for (const row of rows) {
      if (!isOpen(row)) continue;
      const fits = live.filter((variant) => !placed.has(variant.id) && matches(variant, row));
      if (!fits.length) continue;
      // A loose match needs one variant for this colour, and no other open colour for it.
      if (loose && (fits.length > 1 || rows.some((other) => other !== row && isOpen(other) && matches(fits[0], other)))) {
        continue;
      }
      const pick = fits.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a));
      placed.add(pick.id);
      // The sku is taken by a removed row of this product (it comes back instead) or by another
      // product's row: the variant isn't renamed and stays without a colour.
      if (removedBySku.has(skuKey(row.sku)) || heldElsewhere.has(skuKey(row.sku))) {
        settled.add(row);
        notes.push(
          `variant ${pick.id} "${pick.color}" is "${row.color}", but ${row.sku} is held by another row, so it isn't renamed`,
        );
        continue;
      }
      variantOf.set(row, pick);
      renames.push({
        id: pick.id,
        fromColor: pick.color,
        fromSku: pick.sku,
        toColor: row.color,
        toSku: row.sku,
        colorCode: row.colorCode,
        via,
      });
    }
  }

  const renamedIds = new Set(renames.map((rename) => rename.id));
  for (const row of rows) {
    const variant = variantOf.get(row);
    const removed = removedBySku.get(skuKey(row.sku));
    if (variant) {
      row.variantId = variant.id;
      row.action = renamedIds.has(variant.id) ? "rename" : "update";
    } else if (removed) {
      row.variantId = removed.id;
      row.action = "restore";
    } else if (heldElsewhere.has(skuKey(row.sku))) {
      row.action = "conflict";
      notes.push(`"${row.color}": ${row.sku} also belongs to another product`);
    } else {
      row.action = "create";
    }
  }

  // Live variants left without a colour are retired. When SAGE sent no colours at all the
  // product gets a "Default" colour and nothing is retired: that's more likely a gap in
  // SAGE's answer than every colour being dropped.
  const fellBack = source
    ? source === "none"
    : rows.length > 0 && rows.every((row) => row.status === "default");
  const plannedSkus = new Set(rows.map((row) => skuKey(row.sku)));
  const keptIds = new Set([...variantOf.values()].map((variant) => variant.id));
  const retireIds = fellBack
    ? []
    : live
        .filter((variant) => !keptIds.has(variant.id) && !plannedSkus.has(skuKey(variant.sku)))
        .map((variant) => variant.id);

  return { rows, renames, retireIds, notes };
};

module.exports = {
  TEXT_LIMIT,
  isStockReported,
  colorKey,
  skuKey,
  isAbbreviation,
  isFamilyVariant,
  buildSageColorList,
  sageSkuPrefix,
  sageVariantSku,
  findColorPic,
  planSageVariants,
};
