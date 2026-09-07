function descending(value) {
  return Number(value || 0);
}

function rankRisingArtists(artists = []) {
  return [...artists].sort((left, right) => descending(right.momentum_score) - descending(left.momentum_score));
}

function rankMovingReleases(releases = []) {
  return [...releases].sort((left, right) => descending(right.movement_score) - descending(left.movement_score));
}

function rankFreshDrops(releases = []) {
  return [...releases].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

function rankMostViewed(releases = []) {
  return [...releases].sort((left, right) =>
    (descending(right.view_count) + descending(right.video_view_count)) -
    (descending(left.view_count) + descending(left.video_view_count))
  );
}

function rankMostDownloaded(releases = []) {
  return [...releases].sort((left, right) => descending(right.download_count) - descending(left.download_count));
}

module.exports = {
  rankRisingArtists,
  rankMovingReleases,
  rankFreshDrops,
  rankMostViewed,
  rankMostDownloaded
};