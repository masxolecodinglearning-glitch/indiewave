const LIBRARY_FORMATS = ["all", "single", "ep", "album", "mixtape", "dj_mix", "video"];

function filterLibraryReleases(releases = [], format = "all") {
  if (!LIBRARY_FORMATS.includes(format) || format === "all") return releases;
  return releases.filter((release) => release.type === format);
}

function libraryFormatLabel(format) {
  return {
    all: "All",
    single: "Singles",
    ep: "EPs",
    album: "Albums",
    mixtape: "Mixtapes",
    dj_mix: "DJ Mixes",
    video: "Videos"
  }[format] || "All";
}

if (typeof module !== "undefined") module.exports = { LIBRARY_FORMATS, filterLibraryReleases, libraryFormatLabel };