const GENRE_BUCKET_DEFS = [
  { id: "all", label: "All" },
  { id: "afrosounds", label: "Afrosounds", keywords: ["afrosounds", "afro sounds", "afro sound"] },
  { id: "hiphop", label: "Hip-Hop/Rap", keywords: ["hip hop", "hiphop", "rap", "kasi rap", "kasirap"] },
  { id: "amapiano", label: "Amapiano", keywords: ["amapiano", "piano"] },
  { id: "afrobeats", label: "Afrobeats", keywords: ["afrobeats", "afrobeat", "afro beats"] },
  { id: "rnb", label: "R&B", keywords: ["r&b", "r and b", "rnb", "r n b", "rhythm and blues"] },
  { id: "house", label: "House", keywords: ["house", "gqom"] },
  { id: "drill", label: "Drill", keywords: ["drill"] },
  { id: "trap", label: "Trap", keywords: ["trap"] },
  { id: "soul", label: "Soul", keywords: ["soul"] },
  { id: "gospel", label: "Gospel", keywords: ["gospel", "christian"] },
  { id: "pop", label: "Pop", keywords: ["pop"] },
  { id: "jazz", label: "Jazz", keywords: ["jazz"] },
  { id: "other", label: "Other" }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGenreBucket(rawGenre) {
  const normalized = String(rawGenre || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "other";

  for (const bucket of GENRE_BUCKET_DEFS) {
    if (!bucket.keywords) continue;
    const matched = bucket.keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(normalized));
    if (matched) return bucket.id;
  }

  return "other";
}

const tests = [
  "Hip Hop", "Hip-Hop", "Hip Hop/Rap", "hiphop", "Rap", "Trap", "UK Drill",
  "Amapiano", "Piano", "Afrobeats", "Afro Beats", "R&B", "RnB", "Rhythm and Blues",
  "House", "Deep House", "Gqom", "Soul", "Neo Soul", "Gospel", "Pop", "Jazz",
  "Afrosounds", "Kasi Rap", "Reggae", "", null, "Electronic"
];

tests.forEach((t) => console.log(JSON.stringify(t), "->", normalizeGenreBucket(t)));
