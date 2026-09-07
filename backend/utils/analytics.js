const DAY_MS = 24 * 60 * 60 * 1000;

function periodBounds(days, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - days * DAY_MS);
  return { start, end };
}

function previousPeriodBounds(days, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - days * 2 * DAY_MS);
  return { start, end: new Date(end.getTime() - days * DAY_MS) };
}

function eventIdentity(event) {
  if (event.user_id !== null && event.user_id !== undefined) return `user:${event.user_id}`;
  if (event.session_id) return `session:${event.session_id}`;
  return null;
}

function sumEvents(events, eventType) {
  return events
    .filter((event) => event.event_type === eventType)
    .reduce((total, event) => total + Number(event.value || 1), 0);
}

function distinctListeners(events) {
  return new Set(events.map(eventIdentity).filter(Boolean)).size;
}

function calculateMetrics(events = []) {
  return {
    plays: sumEvents(events, "play"),
    views: sumEvents(events, "view"),
    downloads: sumEvents(events, "download"),
    likes: sumEvents(events, "like"),
    distinctListeners: distinctListeners(events.filter((event) => event.event_type === "play"))
  };
}

function growth(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (previousValue === 0) {
    return { current: currentValue, previous: previousValue, state: currentValue > 0 ? "new" : "first activity" };
  }
  return {
    current: currentValue,
    previous: previousValue,
    percentage: ((currentValue - previousValue) / previousValue) * 100,
    state: "compared"
  };
}

function freshness(createdAt, now = new Date()) {
  const ageDays = Math.max(0, (new Date(now).getTime() - new Date(createdAt).getTime()) / DAY_MS);
  return Math.max(0, 1 - ageDays / 30);
}

function artistMomentum({ plays = 0, distinctListeners: listeners = 0, followerGrowth = 0, likes = 0, downloads = 0, recencyBonus = 0 }) {
  return Number(plays) + Number(listeners) * 1.5 + Number(followerGrowth) * 2.5 + Number(likes) * 1.5 + Number(downloads) * 2 + Number(recencyBonus);
}

function artistMomentumSql({ plays, listeners, followerGrowth, likes, downloads, recencyBonus }) {
  return `COALESCE(${plays}, 0) + COALESCE(${listeners}, 0) * 1.5 + COALESCE(${followerGrowth}, 0) * 2.5 + COALESCE(${likes}, 0) * 1.5 + COALESCE(${downloads}, 0) * 2 + CASE WHEN COALESCE(${recencyBonus}, 0) > 0 THEN 1 ELSE 0 END`;
}

function releaseMovement({ plays = 0, views = 0, downloads = 0, likes = 0, freshnessScore = 0 }) {
  return Number(plays) + Number(views) * 0.8 + Number(downloads) * 2 + Number(likes) * 1.5 + Number(freshnessScore);
}

function releaseMovementSql({ plays, views, downloads, likes, freshnessScore }) {
  return `COALESCE(${plays}, 0) + COALESCE(${views}, 0) * 0.8 + COALESCE(${downloads}, 0) * 2 + COALESCE(${likes}, 0) * 1.5 + COALESCE(${freshnessScore}, 0)`;
}

function artistState({ artistExists, hasUsableProfile, publishedReleaseCount, recentEngagement }) {
  if (!artistExists) return "unregistered";
  if (!hasUsableProfile || Number(publishedReleaseCount || 0) < 1) return "registered";
  if (recentEngagement) return "active";
  return "activated";
}

module.exports = {
  DAY_MS,
  periodBounds,
  previousPeriodBounds,
  calculateMetrics,
  distinctListeners,
  growth,
  freshness,
  artistMomentum,
  artistMomentumSql,
  releaseMovement,
  releaseMovementSql,
  artistState
};