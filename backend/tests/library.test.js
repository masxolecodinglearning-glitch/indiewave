const test = require("node:test");
const assert = require("node:assert/strict");
const { filterLibraryReleases, libraryFormatLabel } = require("../../frontend/js/library");

const releases = [
  { id: 1, type: "single" },
  { id: 2, type: "ep" },
  { id: 3, type: "album" },
  { id: 4, type: "mixtape" },
  { id: 5, type: "dj_mix" },
  { id: 6, type: "video" }
];

test("library filters every supported release format without inventing results", () => {
  for (const format of ["single", "ep", "album", "mixtape", "dj_mix", "video"]) {
    assert.equal(filterLibraryReleases(releases, format).length, 1);
  }
  assert.equal(filterLibraryReleases(releases, "all").length, 6);
  assert.equal(filterLibraryReleases(releases, "unknown").length, 6);
  assert.equal(filterLibraryReleases(releases, "album")[0].id, 3);
});

test("library format labels are stable", () => {
  assert.equal(libraryFormatLabel("single"), "Singles");
  assert.equal(libraryFormatLabel("dj_mix"), "DJ Mixes");
});