const API_BASE = "http://localhost:5000/api";
const STORAGE_KEY = "indiewave_auth";

const state = {
  token: "",
  user: null,
  sort: "recent",
  releases: []
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function notify(message) {
  window.alert(message);
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.token = parsed.token || "";
    state.user = parsed.user || null;
  } catch (error) {
    console.error(error);
  }
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function toggleAuthUI() {
  const authenticated = Boolean(state.token && state.user);
  $("logoutBtn").classList.toggle("hidden", !authenticated);
  $("openAuthBtn").classList.toggle("hidden", authenticated);
  $("dashboard").classList.toggle("hidden", !authenticated || state.user.role !== "artist");
  $("adminSection").classList.toggle("hidden", !authenticated || state.user.role !== "admin");
}

function mediaUrl(path) {
  if (!path) return "";
  return `http://localhost:5000/${path}`;
}

function releaseTypeLabel(type) {
  return {
    single: "Single",
    ep: "EP",
    album: "Album",
    mixtape: "Mixtape",
    dj_mix: "DJ Mix",
    video: "Video",
    live_performance: "Live"
  }[type] || type;
}

function renderReleaseCard(release, mine = false) {
  const artwork = release.artwork_path ? `<img src="${mediaUrl(release.artwork_path)}" alt="${escapeHtml(release.title)}" />` : "";
  const releaseId = Number(release.id);

  return `
    <article class="glass release-card">
      ${artwork}
      <h3>${escapeHtml(release.title)}</h3>
      <p class="release-meta">${escapeHtml(release.stage_name || "Unknown Artist")} • ${escapeHtml(releaseTypeLabel(release.type))}</p>
      <p class="release-meta">${escapeHtml(release.genre)} • ${escapeHtml(release.country)}</p>
      <p class="release-meta">Likes: ${release.likes || 0} | Comments: ${release.comments || 0}</p>
      <p class="release-meta">Downloads: ${release.download_count || 0} | Views: ${(release.view_count || 0) + (release.video_view_count || 0)}</p>
      <div class="release-actions">
        <button class="chip" onclick="playRelease(${releaseId})">Play</button>
        <button class="chip" onclick="trackListen(${releaseId})">Listen</button>
        <button class="chip" onclick="trackView(${releaseId})">View</button>
        <button class="chip" onclick="downloadRelease(${releaseId})">Download</button>
        <button class="chip" onclick="likeRelease(${releaseId})">Like</button>
        <button class="chip" onclick="showComments(${releaseId})">Comments</button>
        ${state.user ? `<button class="chip" onclick="openReportForRelease(${releaseId})">Report</button>` : ""}
        ${mine ? `<button class=\"chip\" onclick=\"deleteRelease(${releaseId})\">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function renderArtistCard(artist) {
  return `
    <article class="glass artist-card">
      ${artist.profile_image ? `<img src="${mediaUrl(artist.profile_image)}" alt="${escapeHtml(artist.stage_name)}" />` : ""}
      <h3>${escapeHtml(artist.stage_name || artist.name)}</h3>
      <p class="release-meta">${escapeHtml(artist.country || "")}</p>
      <p class="release-meta">${escapeHtml(artist.genre || "")}</p>
      <div class="release-actions">
        <button class="chip" onclick="viewArtist('${escapeHtml(artist.artist_slug || artist.slug || "")}')">Profile</button>
        ${state.user ? `<button class=\"chip\" onclick=\"followArtist(${artist.artist_id || artist.id})\">Follow</button>` : ""}
      </div>
    </article>
  `;
}

async function loadReleases(filters = {}) {
  const query = new URLSearchParams({ sort: state.sort, ...filters }).toString();
  const data = await api(`/releases?${query}`);
  state.releases = data.releases;

  $("releaseGrid").innerHTML = data.releases.map((release) => renderReleaseCard(release)).join("");

  const artistsMap = new Map();
  data.releases.forEach((release) => {
    if (!artistsMap.has(release.artist_id)) artistsMap.set(release.artist_id, release);
  });

  $("artistGrid").innerHTML = [...artistsMap.values()].map((artistRelease) => renderArtistCard(artistRelease)).join("");

  renderCategoryLists(data.releases);
  renderTaxonomy(data.releases);
}

function renderCategoryLists(releases) {
  const groups = {
    albumsList: releases.filter((r) => r.type === "album"),
    epsList: releases.filter((r) => r.type === "ep"),
    singlesList: releases.filter((r) => r.type === "single"),
    mixtapesList: releases.filter((r) => r.type === "mixtape"),
    djMixesList: releases.filter((r) => r.type === "dj_mix"),
    videosList: releases.filter((r) => r.type === "video")
  };

  Object.entries(groups).forEach(([id, list]) => {
    $(id).innerHTML = list.slice(0, 6).map((release) => `<p>${escapeHtml(release.title)}</p>`).join("") || "<p>No releases yet</p>";
  });
}

function renderTaxonomy(releases) {
  const genres = [...new Set(releases.map((release) => release.genre).filter(Boolean))];
  const countries = [...new Set(releases.map((release) => release.country).filter(Boolean))];

  $("genreChips").innerHTML = genres
    .map((genre) => `<button class=\"chip\" onclick=\"filterByGenre('${escapeHtml(genre)}')\">${escapeHtml(genre)}</button>`)
    .join("");

  $("countryChips").innerHTML = countries
    .map((country) => `<button class=\"chip\" onclick=\"filterByCountry('${escapeHtml(country)}')\">${escapeHtml(country)}</button>`)
    .join("");
}

async function loadMyDashboard() {
  if (!state.user || state.user.role !== "artist") return;
  const data = await api("/releases/dashboard/mine");
  $("myReleaseGrid").innerHTML = data.releases.map((release) => renderReleaseCard(release, true)).join("");
}

async function loadLivePerformances() {
  const data = await api("/live");
  $("liveGrid").innerHTML = data.performances
    .map(
      (item) => `
      <article class="glass release-card">
        <h3>${escapeHtml(item.title)}</h3>
        <p class="release-meta">${escapeHtml(item.stage_name)} • ${new Date(item.scheduled_at).toLocaleString()}</p>
        <p>${escapeHtml(item.description || "")}</p>
        ${item.replay_path ? `<video class="player" controls src="${mediaUrl(item.replay_path)}"></video>` : ""}
      </article>
    `
    )
    .join("");
}

async function loadAdminDashboard() {
  if (!state.user || state.user.role !== "admin") return;
  const data = await api("/admin/dashboard");

  $("adminStats").innerHTML = Object.entries(data.stats)
    .map(([key, value]) => `<div class=\"stat\"><strong>${escapeHtml(key)}</strong><p>${escapeHtml(value)}</p></div>`)
    .join("");

  $("adminReports").innerHTML = `<h3>Open Reports</h3>${
    data.reports
      .map(
        (report) => `<p>#${report.id} | ${escapeHtml(report.report_type)} | ${escapeHtml(report.status)} | ${escapeHtml(report.reason)}</p>`
      )
      .join("") || "<p>No reports available</p>"
  }`;
}

async function initializeData() {
  await loadReleases();
  await loadLivePerformances();
  toggleAuthUI();

  if (state.token) {
    await loadMyDashboard();
    await loadAdminDashboard();
  }
}

async function register(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await api("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  state.token = data.token;
  state.user = data.user;
  saveAuth();
  toggleAuthUI();
  $("authDialog").close();
  notify("Registration successful");
  await loadMyDashboard();
}

async function login(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await api("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  state.token = data.token;
  state.user = data.user;
  saveAuth();
  toggleAuthUI();
  $("authDialog").close();
  notify("Login successful");
  await loadMyDashboard();
  await loadAdminDashboard();
}

async function updateProfile(form) {
  const fields = Object.fromEntries(new FormData(form).entries());
  const profileImage = form.profileImage.files[0];

  await api("/artists/me/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });

  if (profileImage) {
    const uploadData = new FormData();
    uploadData.append("profileImage", profileImage);
    await api("/artists/me/profile-image", {
      method: "POST",
      body: uploadData
    });
  }

  notify("Profile updated");
}

async function uploadRelease(form) {
  const data = new FormData(form);
  const response = await api("/releases", {
    method: "POST",
    body: data
  });
  notify(`Uploaded: ${response.release.title}`);
  await loadReleases();
  await loadMyDashboard();
}

async function scheduleLive(form) {
  const data = new FormData(form);
  data.set("scheduledAt", new Date(data.get("scheduledAt")).toISOString());
  await api("/live", {
    method: "POST",
    body: data
  });
  notify("Live performance scheduled");
  await loadLivePerformances();
}

async function submitReport(form) {
  if (!state.token) {
    notify("Login required to report content");
    return;
  }
  const payload = Object.fromEntries(new FormData(form).entries());
  await api("/admin/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  notify("Report submitted");
  form.reset();
}

window.playRelease = function playRelease(releaseId) {
  const release = state.releases.find((item) => Number(item.id) === Number(releaseId));
  if (!release) return;

  $("nowPlayingTitle").textContent = `${release.title} - ${release.stage_name}`;

  const hasVideo = Boolean(release.media_video_path);
  const audio = $("musicPlayer");
  const video = $("videoPlayer");

  if (hasVideo) {
    video.classList.remove("hidden");
    audio.classList.add("hidden");
    video.src = mediaUrl(release.media_video_path);
    video.play().catch(() => {});
    trackView(releaseId).catch(() => {});
    return;
  }

  audio.classList.remove("hidden");
  video.classList.add("hidden");
  audio.src = mediaUrl(release.media_audio_path);
  audio.play().catch(() => {});
  trackListen(releaseId).catch(() => {});
};

window.trackListen = async function trackListen(releaseId) {
  await api(`/engagement/releases/${releaseId}/listen`, { method: "POST" });
};

window.trackView = async function trackView(releaseId) {
  await api(`/engagement/releases/${releaseId}/view`, { method: "POST" });
};

window.downloadRelease = async function downloadRelease(releaseId) {
  const result = await api(`/engagement/releases/${releaseId}/download`, { method: "POST" });
  if (result.filePath) {
    window.open(`http://localhost:5000/${result.filePath}`, "_blank", "noopener,noreferrer");
  }
};

window.likeRelease = async function likeRelease(releaseId) {
  if (!state.token) {
    notify("Login required");
    return;
  }
  const result = await api(`/social/releases/${releaseId}/like`, { method: "POST" });
  notify(result.liked ? "Release liked" : "Like removed");
  await loadReleases();
};

window.followArtist = async function followArtist(artistId) {
  if (!state.token) {
    notify("Login required");
    return;
  }
  const result = await api(`/social/artists/${artistId}/follow`, { method: "POST" });
  notify(result.followed ? "Artist followed" : "Unfollowed");
};

window.showComments = async function showComments(releaseId) {
  const data = await api(`/social/releases/${releaseId}/comments`);
  const text = data.comments.length
    ? data.comments.map((comment) => `${comment.stage_name}: ${comment.content}`).join("\n")
    : "No comments yet";
  const newComment = window.prompt(`Comments:\n${text}\n\nWrite a comment (optional):`, "");
  if (!newComment) return;
  if (!state.token) {
    notify("Login required to comment");
    return;
  }
  await api(`/social/releases/${releaseId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: newComment })
  });
  notify("Comment added");
  await loadReleases();
};

window.deleteRelease = async function deleteRelease(releaseId) {
  if (!window.confirm("Delete this release?")) return;
  await api(`/releases/${releaseId}`, { method: "DELETE" });
  notify("Release deleted");
  await loadReleases();
  await loadMyDashboard();
};

window.filterByGenre = async function filterByGenre(genre) {
  await loadReleases({ genre });
};

window.filterByCountry = async function filterByCountry(country) {
  await loadReleases({ country });
};

window.viewArtist = async function viewArtist(slug) {
  if (!slug) return;
  const profile = await api(`/artists/${slug}`);
  notify(`Artist: ${profile.artist.stage_name}\nFollowers: ${profile.stats.followers}\nReleases: ${profile.stats.releases}`);
};

window.openReportForRelease = function openReportForRelease(releaseId) {
  const form = $("reportForm");
  form.targetType.value = "release";
  form.targetId.value = releaseId;
  form.scrollIntoView({ behavior: "smooth" });
};

function wireEvents() {
  $("openAuthBtn").addEventListener("click", () => $("authDialog").showModal());
  $("closeAuthBtn").addEventListener("click", () => $("authDialog").close());

  $("logoutBtn").addEventListener("click", () => {
    state.token = "";
    state.user = null;
    saveAuth();
    toggleAuthUI();
    notify("Logged out");
  });

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await login(event.target);
    } catch (error) {
      notify(error.message);
    }
  });

  $("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await register(event.target);
    } catch (error) {
      notify(error.message);
    }
  });

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.authTab;
      document.querySelectorAll("[data-auth-tab]").forEach((other) => other.classList.remove("active"));
      button.classList.add("active");
      $("loginForm").classList.toggle("hidden", tab !== "login");
      $("registerForm").classList.toggle("hidden", tab !== "register");
    });
  });

  $("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await updateProfile(event.target);
    } catch (error) {
      notify(error.message);
    }
  });

  $("releaseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await uploadRelease(event.target);
      event.target.reset();
    } catch (error) {
      notify(error.message);
    }
  });

  $("liveForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await scheduleLive(event.target);
      event.target.reset();
    } catch (error) {
      notify(error.message);
    }
  });

  $("searchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("searchInput").value.trim();
    await loadReleases(query ? { q: query } : {});
  });

  $("refreshLiveBtn").addEventListener("click", async () => {
    await loadLivePerformances();
  });

  document.querySelectorAll(".sort-chip").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".sort-chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.sort = button.dataset.sort;
      await loadReleases();
    });
  });

  $("reportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitReport(event.target);
    } catch (error) {
      notify(error.message);
    }
  });
}

async function bootstrap() {
  loadAuth();
  wireEvents();

  if (state.token) {
    try {
      const me = await api("/auth/me");
      state.user = me.user;
      saveAuth();
    } catch (error) {
      state.token = "";
      state.user = null;
      saveAuth();
    }
  }

  try {
    await initializeData();
  } catch (error) {
    notify(error.message);
  }
}

bootstrap();
