const API_BASE = "https://indiewave-09eu.onrender.com/api";
const STORAGE_KEY = "indiewave_auth";

const state = {
  token: "",
  user: null,
  sort: "recent",
  trendingSort: "trending",
  releases: [],
  trendingReleases: [],
  currentReleaseId: null,
  commentsReleaseId: null,
  activeConversationId: null,
  activeConversationUser: null,
  messageView: "list",
  conversations: [],
  ai: {
    loading: false,
    lastRequest: null,
    lastResponse: ""
  }
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

function setUploadStatus(statusText, detail = "") {
  const status = $("releaseUploadStatus");
  const statusTextEl = $("releaseUploadStatusText");
  const statusBar = $("releaseUploadStatusBar");
  const statusDetail = $("releaseUploadStatusDetail");

  if (!status || !statusTextEl || !statusBar || !statusDetail) return;

  status.classList.remove("hidden");
  statusTextEl.textContent = statusText;
  statusDetail.textContent = detail || "";

  const isUpload = statusText === "Uploading...";
  const isProcessing = statusText === "Processing...";
  const isComplete = statusText === "Completed";
  const isFailed = statusText === "Failed";

  status.classList.toggle("upload-status-success", isComplete);
  status.classList.toggle("upload-status-error", isFailed);
  status.classList.toggle("upload-status-processing", isProcessing);
  statusBar.classList.toggle("indeterminate", isUpload || isProcessing);
  statusBar.classList.toggle("complete", isComplete || isFailed);

  if (isUpload || isProcessing) {
    statusBar.style.width = "70%";
    return;
  }

  statusBar.style.width = "100%";
}

function showUploadNotification(kind, title, message) {
  const container = document.getElementById("uploadToastContainer") || document.createElement("div");
  container.id = "uploadToastContainer";
  container.className = "upload-toast-container";
  if (!container.parentNode) {
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `upload-toast upload-toast-${kind}`;
  toast.innerHTML = `
    <button type="button" class="upload-toast-close" aria-label="Close notification">✕</button>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
  `;

  const closeButton = toast.querySelector(".upload-toast-close");
  closeButton.addEventListener("click", () => {
    toast.classList.add("is-hiding");
    setTimeout(() => toast.remove(), 220);
  });

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  setTimeout(() => {
    toast.classList.add("is-hiding");
    setTimeout(() => toast.remove(), 220);
  }, 4200);
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

function aiElementsReady() {
  return Boolean($("aiConversation") && $("aiStatus") && $("aiSendBtn") && $("aiChatInput"));
}

function setAiStatus(message, isError = false) {
  if (!$("aiStatus")) return;
  $("aiStatus").textContent = message || "";
  $("aiStatus").style.color = isError ? "#ff8cad" : "";
}

function setAiLoading(loading) {
  state.ai.loading = loading;
  if ($("aiSendBtn")) $("aiSendBtn").disabled = loading;
  if ($("aiCopyBtn")) $("aiCopyBtn").disabled = loading;
  if ($("aiRegenerateBtn")) $("aiRegenerateBtn").disabled = loading;
  if ($("aiQuickBioBtn")) $("aiQuickBioBtn").disabled = loading;
  if ($("aiQuickCaptionBtn")) $("aiQuickCaptionBtn").disabled = loading;
  if ($("aiQuickChatBtn")) $("aiQuickChatBtn").disabled = loading;
}

function addAiMessage(role, text) {
  if (!$("aiConversation")) return;

  const item = document.createElement("article");
  item.className = `ai-message ai-message-${role}`;

  const heading = document.createElement("strong");
  heading.textContent = role === "assistant" ? "IndieWave AI:" : "You:";

  const body = document.createElement("p");
  body.textContent = text;

  item.appendChild(heading);
  item.appendChild(body);
  $("aiConversation").appendChild(item);
  $("aiConversation").scrollTop = $("aiConversation").scrollHeight;
}

function ensureAiAuth() {
  if (!state.token) {
    throw new Error("Login required to use IndieWave AI");
  }
}

function showAiPanel(mode) {
  if (!$("aiBioForm") || !$("aiCaptionForm")) return;
  $("aiBioForm").classList.toggle("hidden", mode !== "bio");
  $("aiCaptionForm").classList.toggle("hidden", mode !== "caption");
  if (mode === "chat" && $("aiChatInput")) {
    $("aiChatInput").focus();
  }
}

async function sendAiRequest(config) {
  ensureAiAuth();
  setAiLoading(true);
  setAiStatus("IndieWave AI is thinking...");

  try {
    const result = await api(config.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config.payload)
    });

    const responseText = String(result[config.responseKey] || "").trim();
    if (!responseText) {
      throw new Error("AI returned an empty response");
    }

    state.ai.lastRequest = config;
    state.ai.lastResponse = responseText;
    setAiStatus("Response ready");
    return responseText;
  } finally {
    setAiLoading(false);
  }
}

async function runAiChat(message) {
  const text = String(message || "").trim();
  if (!text) throw new Error("Enter a message");
  if (text.length > 4000) throw new Error("Message is too long");

  addAiMessage("user", text);
  const response = await sendAiRequest({
    path: "/ai/chat",
    payload: { message: text },
    responseKey: "response"
  });
  addAiMessage("assistant", response);
}

async function runAiBio(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const hasValue = Object.values(payload).some((value) => String(value || "").trim());
  if (!hasValue) {
    throw new Error("Add at least one bio detail");
  }

  const bio = await sendAiRequest({
    path: "/ai/bio",
    payload,
    responseKey: "bio"
  });
  addAiMessage("assistant", `Artist Bio\n${bio}`);
}

async function runAiCaption(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const hasValue = Object.values(payload).some((value) => String(value || "").trim());
  if (!hasValue) {
    throw new Error("Add at least one marketing detail");
  }

  const caption = await sendAiRequest({
    path: "/ai/marketing-caption",
    payload,
    responseKey: "caption"
  });
  addAiMessage("assistant", `Marketing Caption\n${caption}`);
}

function toggleAuthUI() {
  const authenticated = Boolean(state.token && state.user);
  const isArtist = state.user?.role === "artist";
  const isAdmin = state.user?.role === "admin";

  $("logoutBtn").classList.toggle("hidden", !authenticated);
  $("openAuthBtn").classList.toggle("hidden", authenticated);
  $("messagesBtn").classList.toggle("hidden", !authenticated);
  $("notificationsBtn").classList.toggle("hidden", !authenticated);

  const dashboardBtn = $("dashboardBtn");
  if (dashboardBtn) dashboardBtn.classList.toggle("hidden", !authenticated || !isArtist);

  $("dashboard").classList.toggle("hidden", !authenticated || !isArtist);
  $("adminSection").classList.toggle("hidden", !authenticated || !isAdmin);

  const messagesSection = $("messages");
  if (messagesSection) messagesSection.classList.toggle("hidden", !authenticated);

  const notificationsPanel = $("notificationsPanel");
  if (notificationsPanel) notificationsPanel.classList.add("hidden");

  const messagesPanel = $("messagesPanel");
  if (messagesPanel) messagesPanel.classList.add("hidden");

  state.activeConversationId = null;
  state.messageView = "list";

  // Show/hide marketplace seller CTA buttons
  const sellBtn  = $("mktSellBtn");
  const eventBtn = $("mktEventBtn");
  if (sellBtn)  sellBtn.classList.toggle("hidden", !authenticated);
  if (eventBtn) eventBtn.classList.toggle("hidden", !authenticated);

  const myProductsPanel = $("mktMyProducts");
  const myEventsPanel = $("mktMyEvents");
  if (myProductsPanel) myProductsPanel.classList.toggle("hidden", !authenticated || !isArtist);
  if (myEventsPanel) myEventsPanel.classList.toggle("hidden", !authenticated || !isArtist);
}

function showHomeView() {
  document.querySelectorAll("main > section").forEach((section) => {
    if (section.id === "dashboard") {
      section.classList.add("hidden");
      return;
    }
    if (section.id === "adminSection" && state.user?.role !== "admin") {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
  });

  const dashboard = $("dashboard");
  if (dashboard) dashboard.classList.add("hidden");

  const adminSection = $("adminSection");
  if (adminSection && state.user?.role !== "admin") adminSection.classList.add("hidden");

  const notificationsPanel = $("notificationsPanel");
  if (notificationsPanel) notificationsPanel.classList.add("hidden");
}

function showDashboardView() {
  document.querySelectorAll("main > section").forEach((section) => {
    const isDashboard = section.id === "dashboard";
    const isAdmin = section.id === "adminSection";
    if (isDashboard || (isAdmin && state.user?.role === "admin")) {
      section.classList.remove("hidden");
      return;
    }
    section.classList.add("hidden");
  });

  const dashboard = $("dashboard");
  if (dashboard) {
    dashboard.classList.remove("hidden");
    dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const notificationsPanel = $("notificationsPanel");
  if (notificationsPanel) notificationsPanel.classList.add("hidden");

  const messagesPanel = $("messagesPanel");
  if (messagesPanel) messagesPanel.classList.add("hidden");
}

// Legacy paths ("uploads/..." or "../uploads/...") are served by Render express.static.
// New R2 object keys ("audio/...", "video/...", "artwork/...", "profiles/...") are streamed
// through the backend proxy at GET /api/media/<key>.
function mediaUrl(filePath) {
  if (!filePath) return "";
  const p = String(filePath).replace(/\\/g, "/");
  if (p.startsWith("../uploads/") || p.startsWith("uploads/")) {
    const clean = p.replace(/^(\.\.\/)*/, "");
    return `https://indiewave-09eu.onrender.com/${clean}`;
  }
  return `https://indiewave-09eu.onrender.com/api/media/${p}`;
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
      <p class="release-meta">${escapeHtml(release.stage_name || "Unknown Artist")} â€¢ ${escapeHtml(releaseTypeLabel(release.type))}</p>
      <p class="release-meta">${escapeHtml(release.genre)} â€¢ ${escapeHtml(release.country)}</p>
      <p class="release-meta">Likes: ${release.likes || 0} | Comments: ${release.comments || 0}</p>
      <p class="release-meta">Downloads: ${release.download_count || 0} | Views: ${(release.view_count || 0) + (release.video_view_count || 0)}</p>
      <div class="release-actions">
        <button class="chip" onclick="playRelease(${releaseId})">Play</button>
        <button class="chip" onclick="trackListen(${releaseId})">Listen</button>
        <button class="chip" onclick="trackView(${releaseId})">View</button>
        <button class="chip" onclick="downloadRelease(${releaseId})">Download</button>
        <button class="chip" onclick="likeRelease(${releaseId})">Like</button>
        <button class="chip" onclick="showComments(${releaseId})">Comments</button>
        ${state.user && Number(release.artist_id) !== Number(state.user.id) ? `<button class="chip" onclick="openConversation(${release.artist_id})">Message</button>` : ""}
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
        ${state.user && Number(artist.artist_id || artist.id) !== Number(state.user.id) ? `<button class="chip" onclick="openConversation(${artist.artist_id || artist.id})">Message</button>` : ""}
        ${state.user ? `<button class=\"chip\" onclick=\"followArtist(${artist.artist_id || artist.id})\">Follow</button>` : ""}
      </div>
    </article>
  `;
}

async function loadReleases(filters = {}) {
  const query = new URLSearchParams({ sort: state.sort, ...filters }).toString();
  const data = await api(`/releases?${query}`);
  state.releases = data.releases;

  $('releaseGrid').innerHTML =
    data.releases.map((release) => renderReleaseCard(release)).join("") ||
    '<div class="empty-state"><p class="empty-state-title">No releases yet.</p><p class="empty-state-text">Upload your music and start building your audience on IndieWave.</p><a href="#dashboard" class="btn btn-primary empty-state-btn">Upload Your Music</a></div>';

  const artistsMap = new Map();
  data.releases.forEach((release) => {
    if (!artistsMap.has(release.artist_id)) artistsMap.set(release.artist_id, release);
  });

  $("artistGrid").innerHTML = [...artistsMap.values()].map((artistRelease) => renderArtistCard(artistRelease)).join("");

  renderCategoryLists(data.releases);
  renderTaxonomy(data.releases);
}

async function loadTrendingReleases(filters = {}) {
  const query = new URLSearchParams({ sort: state.trendingSort, ...filters }).toString();
  const data = await api(`/releases?${query}`);
  state.trendingReleases = data.releases;

  if (!$("trendingGrid")) return;
  $("trendingGrid").innerHTML =
    data.releases.map((release) => renderReleaseCard(release)).join("") ||
    '<div class="empty-state"><p class="empty-state-title">No trending releases yet.</p><p class="empty-state-text">Be the first to upload and get discovered on IndieWave.</p><a href="#dashboard" class="btn btn-primary empty-state-btn">Upload Your Music</a></div>';
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

  const emptyHtml = '<p class="type-empty-state">No releases yet.<br><a href="#dashboard" class="type-upload-link">Upload your music</a></p>';
  Object.entries(groups).forEach(([id, list]) => {
    $(id).innerHTML = list.slice(0, 6).map((release) => `<p>${escapeHtml(release.title)}</p>`).join("") || emptyHtml;
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
  
  // Update dashboard header with artist name
  const artistName = state.user.stage_name || state.user.name || "Artist";
  const dashboardNameEl = $("dashboardArtistName");
  if (dashboardNameEl) {
    dashboardNameEl.textContent = artistName;
  }
}

async function loadLivePerformances() {
  const data = await api("/live");
  $("liveGrid").innerHTML = data.performances
    .map(
      (item) => `
      <article class="glass release-card">
        <h3>${escapeHtml(item.title)}</h3>
        <p class="release-meta">${escapeHtml(item.stage_name)} â€¢ ${new Date(item.scheduled_at).toLocaleString()}</p>
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
  await loadTrendingReleases();
  await loadLivePerformances();
  toggleAuthUI();
  loadMarketplaceProducts();
  loadMarketplaceEvents();

  if (state.token) {
    await loadMyDashboard();
    await loadAdminDashboard();
    await loadMyMktProducts();
    await loadMyMktEvents();
    await loadConversations();
    await loadNotifications();
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
  await loadMyMktProducts();
  await loadMyMktEvents();
  await loadConversations();
  await loadNotifications();
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
  await loadMyMktProducts();
  await loadMyMktEvents();
  await loadAdminDashboard();
  await loadConversations();
  await loadNotifications();
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
  setUploadStatus("Uploading...", "Uploading your media...");

  try {
    const response = await api("/releases", {
      method: "POST",
      body: data
    });

    setUploadStatus("Processing...", "Processing your upload...");
    setUploadStatus("Completed", "Upload complete");
    showUploadNotification(
      "success",
      "✓ Upload complete",
      response?.release?.title ? `Your release “${response.release.title}” has been uploaded successfully.` : "Your upload has been completed successfully."
    );

    await loadReleases();
    await loadMyDashboard();
    form.reset();
    return response;
  } catch (error) {
    console.error("Upload release failed:", error);
    const safeMessage = typeof error?.message === "string" && !/(credential|secret|stack trace|database|r2|internal|path|server)/i.test(error.message)
      ? error.message
      : "Please try again.";

    setUploadStatus("Failed", safeMessage);
    showUploadNotification("error", "✕ Upload failed", safeMessage);
    return null;
  }
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
  let release = state.releases.find((item) => Number(item.id) === Number(releaseId));
  if (!release) release = state.trendingReleases.find((item) => Number(item.id) === Number(releaseId));
  if (!release) return;

  state.currentReleaseId = Number(releaseId);
  $('nowPlayingTitle').textContent = `${release.title} - ${release.stage_name}`;

  const hasVideo = Boolean(release.media_video_path);
  const audio = $("musicPlayer");
  const video = $("videoPlayer");

  if (hasVideo) {
    video.classList.remove("hidden");
    audio.classList.add("hidden");
    video.src = mediaUrl(release.media_video_path);
    video.play().catch(() => {});
    trackView(releaseId).catch(() => {});
    updateVisualizerState();
    return;
  }

  audio.classList.remove("hidden");
  video.classList.add("hidden");
  audio.src = mediaUrl(release.media_audio_path);
  audio.play().catch(() => {});
  trackListen(releaseId).catch(() => {});
  updateVisualizerState();
};

function updateVisualizerState() {
  const audio = $("musicPlayer");
  const vizContainer = document.querySelector(".visualizer-container");
  if (!vizContainer) return;
  
  if (audio && !audio.paused) {
    vizContainer.parentElement.classList.add("musicPlayer--playing");
  } else {
    vizContainer.parentElement.classList.remove("musicPlayer--playing");
  }
}

function showDashboardForm(formId) {
  const forms = document.querySelectorAll(".dashboard-form");
  forms.forEach(form => form.classList.add("hidden"));
  const form = $(formId);
  if (form) form.classList.remove("hidden");
}

function closeDashboardForm() {
  const forms = document.querySelectorAll(".dashboard-form");
  forms.forEach(form => form.classList.add("hidden"));
}

function prevTrack() {
  if (!state.releases.length) return;
  const idx = state.releases.findIndex((r) => Number(r.id) === state.currentReleaseId);
  const prev = idx <= 0 ? state.releases[state.releases.length - 1] : state.releases[idx - 1];
  if (prev) playRelease(prev.id);
}

function nextTrack() {
  if (!state.releases.length) return;
  const idx = state.releases.findIndex((r) => Number(r.id) === state.currentReleaseId);
  const next = (idx === -1 || idx >= state.releases.length - 1) ? state.releases[0] : state.releases[idx + 1];
  if (next) playRelease(next.id);
}

window.trackListen = async function trackListen(releaseId) {
  await api(`/engagement/releases/${releaseId}/listen`, { method: "POST" });
};

window.trackView = async function trackView(releaseId) {
  await api(`/engagement/releases/${releaseId}/view`, { method: "POST" });
};

function setMessageView(mode) {
  state.messageView = mode;
  const panel = $("messagesPanel");
  const backBtn = $("messageBackBtn");
  const list = $("conversationList");
  const thread = $("conversationWindow");
  if (!panel) return;

  panel.classList.toggle("messages-thread-open", mode === "thread");
  panel.classList.toggle("messages-inbox-open", mode === "list");
  if (backBtn) backBtn.classList.toggle("hidden", mode !== "thread");
  if (list) list.classList.toggle("hidden", mode === "thread");
  if (thread) thread.classList.toggle("hidden", mode !== "thread");
}

async function loadConversations() {
  if (!state.token || !$("conversationList")) return;

  try {
    const data = await api("/messages/conversations");
    state.conversations = data.conversations || [];
    const list = $("conversationList");
    if (!state.conversations.length) {
      list.innerHTML = '<p class="release-meta">No conversations yet.</p>';
      setMessageView("list");
      return;
    }

    list.innerHTML = state.conversations.map((conversation) => {
      const name = conversation.other_user?.stage_name || "User";
      const snippet = conversation.last_message ? escapeHtml(conversation.last_message) : "No messages yet";
      const unread = conversation.unread_count > 0 ? `<span class="message-unread-badge">${conversation.unread_count}</span>` : "";
      const active = Number(conversation.id) === Number(state.activeConversationId) ? " active" : "";
      const time = conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <button class="conversation-item${active}" type="button" data-conversation-id="${conversation.id}" data-user-id="${conversation.other_user?.id || ""}" onclick="openConversation(${conversation.other_user?.id || 0})">
          <div class="conversation-meta">
            <strong>${escapeHtml(name)}</strong>
            ${unread}
          </div>
          <div class="conversation-preview-row">
            <small>${snippet}</small>
            ${time ? `<span class="conversation-time">${escapeHtml(time)}</span>` : ""}
          </div>
        </button>
      `;
    }).join("");

    if (!state.activeConversationId && state.conversations[0] && state.messageView !== "list") {
      const first = state.conversations[0];
      await openConversation(first.other_user?.id || 0);
    }

    setMessageView(state.activeConversationId ? "thread" : "list");
  } catch (error) {
    if ($("conversationList")) $("conversationList").innerHTML = '<p class="release-meta">Could not load messages.</p>';
  }
}

async function loadNotifications() {
  if (!state.token) return;

  try {
    const data = await api("/notifications");
    const notifications = data.notifications || [];
    const countEl = $("notificationCount");
    const listEl = $("notificationList");
    const unreadCount = notifications.filter((item) => !item.is_read).length;

    if (countEl) {
      countEl.textContent = unreadCount;
      countEl.classList.toggle("hidden", unreadCount === 0);
    }

    if (!listEl) return;
    if (!notifications.length) {
      listEl.innerHTML = '<p class="release-meta">No notifications yet.</p>';
      return;
    }

    listEl.innerHTML = notifications.map((notification) => {
      const unread = notification.is_read ? "" : " unread";
      const onClick = notification.related_id ? `onclick="handleNotificationClick(${notification.id}, ${notification.related_id})"` : "";
      return `
        <button class="notification-item${unread}" type="button" ${onClick}>
          <strong>${escapeHtml(notification.type || "Update")}</strong>
          <span>${escapeHtml(notification.message)}</span>
          <small>${new Date(notification.created_at).toLocaleString()}</small>
        </button>
      `;
    }).join("");
  } catch (error) {
    if ($("notificationList")) $("notificationList").innerHTML = '<p class="release-meta">Could not load notifications.</p>';
  }
}

window.handleNotificationClick = async function handleNotificationClick(notificationId, conversationId) {
  try {
    await api(`/notifications/${notificationId}/read`, { method: "PATCH" });
    const panel = $("notificationsPanel");
    if (panel) panel.classList.add("hidden");

    if (conversationId) {
      const match = (state.conversations || []).find((conversation) => Number(conversation.id) === Number(conversationId));
      if (match && match.other_user?.id) {
        await openConversation(match.other_user.id);
        return;
      }
    }

    await loadNotifications();
  } catch (error) {
    notify(error.message);
  }
};

async function openConversation(userId) {
  if (!state.token || !userId) return;

  try {
    const result = await api(`/messages/conversations/${userId}`, { method: "POST" });
    state.activeConversationId = Number(result.conversation.id);
    state.activeConversationUser = result.otherUser || null;
    state.messageView = "thread";

    const panel = $("messagesPanel");
    if (panel) panel.classList.remove("hidden");

    const title = $("conversationTitle");
    if (title) title.textContent = state.activeConversationUser?.stage_name || "Conversation";

    setMessageView("thread");
    await loadConversationMessages();
    await loadConversations();
  } catch (error) {
    notify(error.message);
  }
}

async function loadConversationMessages() {
  if (!state.activeConversationId || !state.token) return;

  try {
    const data = await api(`/messages/conversations/${state.activeConversationId}/messages`);
    const list = $("messagesList");
    if (!list) return;

    if (!data.messages.length) {
      list.innerHTML = '<p class="release-meta">No messages yet.</p>';
      return;
    }

    list.innerHTML = data.messages.map((message) => {
      const mine = Number(message.sender_id) === Number(state.user.id);
      return `
        <div class="message-bubble ${mine ? "self" : "other"}">
          <p>${escapeHtml(message.message)}</p>
          <small>${new Date(message.created_at).toLocaleString()}</small>
        </div>
      `;
    }).join("");

    list.scrollTop = list.scrollHeight;
  } catch (error) {
    if ($("messagesList")) $("messagesList").innerHTML = '<p class="release-meta">Could not load messages.</p>';
  }
}

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
  await loadTrendingReleases();
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
  const dialog = $("commentsDialog");
  if (!dialog) {
    // fallback to original prompt if dialog element is missing
    const data = await api(`/social/releases/${releaseId}/comments`);
    const text = data.comments.length
      ? data.comments.map((c) => `${c.stage_name}: ${c.content}`).join("\n")
      : "No comments yet";
    const newComment = window.prompt(`Comments:\n${text}\n\nWrite a comment (optional):`, "");
    if (!newComment) return;
    if (!state.token) { notify("Login required to comment"); return; }
    await api(`/social/releases/${releaseId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment })
    });
    notify("Comment added");
    await loadReleases(); await loadTrendingReleases();
    return;
  }

  state.commentsReleaseId = releaseId;
  const listContainer = $("commentsListContainer");
  listContainer.innerHTML = '<p class="release-meta">Loading comments...</p>';
  dialog.showModal();

  try {
    const data = await api(`/social/releases/${releaseId}/comments`);
    if (!data.comments.length) {
      listContainer.innerHTML = '<p class="release-meta comments-empty">No comments yet. Be the first!</p>';
    } else {
      listContainer.innerHTML = data.comments.map((c) => `
        <div class="comment-item">
          <strong class="comment-author">${escapeHtml(c.stage_name)}</strong>
          <p class="comment-text">${escapeHtml(c.content)}</p>
        </div>
      `).join("");
    }
  } catch (e) {
    listContainer.innerHTML = '<p class="release-meta">Could not load comments.</p>';
  }
};

window.deleteRelease = async function deleteRelease(releaseId) {
  if (!window.confirm("Delete this release?")) return;
  await api(`/releases/${releaseId}`, { method: "DELETE" });
  notify("Release deleted");
  await loadReleases();
  await loadTrendingReleases();
  await loadMyDashboard();
};

window.filterByGenre = async function filterByGenre(genre) {
  await loadReleases({ genre });
  await loadTrendingReleases({ genre });
};

window.filterByCountry = async function filterByCountry(country) {
  await loadReleases({ country });
  await loadTrendingReleases({ country });
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
    state.activeConversationId = null;
    state.conversations = [];
    saveAuth();
    toggleAuthUI();
    const panel = $("notificationsPanel");
    if (panel) panel.classList.add("hidden");
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
    const uploadResult = await uploadRelease(event.target);
    if (uploadResult) {
      await loadTrendingReleases();
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
    await loadTrendingReleases(query ? { q: query } : {});
  });

  document.querySelectorAll(".trending-chip").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".trending-chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.trendingSort = button.dataset.sort;
      await loadTrendingReleases();
    });
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

  if (aiElementsReady()) {
    $("aiQuickBioBtn").addEventListener("click", () => showAiPanel("bio"));
    $("aiQuickCaptionBtn").addEventListener("click", () => showAiPanel("caption"));
    $("aiQuickChatBtn").addEventListener("click", () => showAiPanel("chat"));

    $("aiChatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await runAiChat($("aiChatInput").value);
        $("aiChatInput").value = "";
      } catch (error) {
        setAiStatus(error.message, true);
      }
    });

    $("aiBioForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await runAiBio(event.target);
      } catch (error) {
        setAiStatus(error.message, true);
      }
    });

    $("aiCaptionForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await runAiCaption(event.target);
      } catch (error) {
        setAiStatus(error.message, true);
      }
    });

    $("aiCopyBtn").addEventListener("click", async () => {
      const response = String(state.ai.lastResponse || "").trim();
      if (!response) {
        setAiStatus("No AI response to copy", true);
        return;
      }

      try {
        await navigator.clipboard.writeText(response);
        setAiStatus("Response copied");
      } catch (error) {
        setAiStatus("Copy failed on this browser", true);
      }
    });

    $("aiRegenerateBtn").addEventListener("click", async () => {
      if (!state.ai.lastRequest) {
        setAiStatus("No AI request to regenerate", true);
        return;
      }

      try {
        const response = await sendAiRequest(state.ai.lastRequest);
        addAiMessage("assistant", response);
      } catch (error) {
        setAiStatus(error.message, true);
      }
    });

    showAiPanel("chat");
    addAiMessage("assistant", "How can I help you today?");
  }

  // Dashboard action buttons
  const dashboardProfileBtn = $("dashboardProfileBtn");
  const dashboardUploadBtn = $("dashboardUploadBtn");
  const dashboardLiveBtn = $("dashboardLiveBtn");
  
  if (dashboardProfileBtn) {
    dashboardProfileBtn.addEventListener("click", () => {
      showDashboardForm("profileForm");
    });
  }
  
  if (dashboardUploadBtn) {
    dashboardUploadBtn.addEventListener("click", () => {
      showDashboardForm("releaseForm");
    });
  }
  
  if (dashboardLiveBtn) {
    dashboardLiveBtn.addEventListener("click", () => {
      showDashboardForm("liveForm");
    });
  }

  // Visualizer state tracking
  const audio = $("musicPlayer");
  if (audio) {
    audio.addEventListener("play", () => {
      updateVisualizerState();
    });
    audio.addEventListener("pause", () => {
      updateVisualizerState();
    });
  }

  // Prev / Next track buttons
  const prevBtn = $("prevTrackBtn");
  const nextBtn = $("nextTrackBtn");
  if (prevBtn) prevBtn.addEventListener("click", prevTrack);
  if (nextBtn) nextBtn.addEventListener("click", nextTrack);

  const messageBackBtn = $("messageBackBtn");
  if (messageBackBtn) {
    messageBackBtn.addEventListener("click", () => {
      state.activeConversationId = null;
      state.activeConversationUser = null;
      state.messageView = "list";
      setMessageView("list");
      loadConversations();
    });
  }

  const messageForm = $("messageForm");
  if (messageForm) {
    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.token || !state.activeConversationId) return;
      const input = $("messageInput");
      const content = (input ? input.value : "").trim();
      if (!content) return;

      try {
        await api(`/messages/conversations/${state.activeConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content })
        });
        if (input) input.value = "";
        await loadConversationMessages();
        await loadConversations();
        await loadNotifications();
      } catch (error) {
        notify(error.message);
      }
    });
  }

  const messagesBtn = $("messagesBtn");
  if (messagesBtn) {
    messagesBtn.addEventListener("click", async () => {
      const section = $("messages");
      const panel = $("messagesPanel");
      if (section) section.classList.remove("hidden");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        panel.classList.toggle("hidden", !isHidden);
        if (!panel.classList.contains("hidden")) {
          await loadConversations();
        }
      }
    });
  }

  const dashboardBtn = $("dashboardBtn");
  if (dashboardBtn) {
    dashboardBtn.addEventListener("click", () => {
      closeDashboardForm();
      showDashboardView();
    });
  }

  document.querySelectorAll('a[href="#dashboard"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      closeDashboardForm();
      showDashboardView();
    });
  });

  document.querySelectorAll('a[href="#home"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showHomeView();
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  });

  const notificationsBtn = $("notificationsBtn");
  if (notificationsBtn) {
    notificationsBtn.addEventListener("click", () => {
      const panel = $("notificationsPanel");
      if (!panel) return;
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        loadNotifications();
      }
    });
  }

  // Marketplace dashboard buttons
  const mktProductDashBtn = $("dashboardMktProductBtn");
  const mktEventDashBtn   = $("dashboardMktEventBtn");
  if (mktProductDashBtn) mktProductDashBtn.addEventListener("click", () => showDashboardForm("mktProductForm"));
  if (mktEventDashBtn)   mktEventDashBtn.addEventListener("click",   () => showDashboardForm("mktEventForm"));

  // Marketplace form submissions
  const mktProductFormEl = $("mktProductForm");
  if (mktProductFormEl) {
    mktProductFormEl.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await submitMktProduct(ev.target); } catch (e) { notify(e.message); }
    });
  }

  const mktEventFormEl = $("mktEventForm");
  if (mktEventFormEl) {
    mktEventFormEl.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await submitMktEvent(ev.target); } catch (e) { notify(e.message); }
    });
  }

  // Product / event detail dialog close buttons
  const mktPDClose = $("mktProductDialogClose");
  const mktEDClose = $("mktEventDialogClose");
  if (mktPDClose) mktPDClose.addEventListener("click", () => $("mktProductDialog").close());
  if (mktEDClose) mktEDClose.addEventListener("click", () => $("mktEventDialog").close());
}

// ============================================================
// MARKETPLACE
// ============================================================

function mktMediaUrl(path) {
  return mediaUrl(path); // reuse existing normalizer
}

function mktFormatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-ZA", { weekday: "short", year: "numeric", month: "long", day: "numeric" });
  } catch { return dateStr; }
}

function mktFormatTime(timeStr) {
  if (!timeStr) return "";
  return timeStr.slice(0, 5); // HH:MM
}

function mktBuildWhatsAppUrl(raw, eventTitle) {
  if (!raw) return null;
  const msg = encodeURIComponent(`Hi, I would like to buy tickets for ${eventTitle || "your event"}.`);
  if (/^https?:\/\//i.test(raw)) return `${raw}?text=${msg}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 7) return `https://wa.me/${digits}?text=${msg}`;
  return raw;
}

// ── Render helpers ───────────────────────────────────────────

function renderMktProductCard(p) {
  const img = p.image_path
    ? `<img class="mkt-product-img" src="${mktMediaUrl(p.image_path)}" alt="${escapeHtml(p.title)}" loading="lazy" />`
    : `<div class="mkt-event-poster-placeholder">🛍️</div>`;

  const buyBtn = p.external_purchase_url
    ? `<a class="btn btn-primary" href="${escapeHtml(p.external_purchase_url)}" target="_blank" rel="noopener noreferrer">Buy Now</a>`
    : "";
  const waBtn = p.whatsapp_contact
    ? `<a class="btn btn-outline" href="${escapeHtml(mktBuildWhatsAppUrl(p.whatsapp_contact, p.title))}" target="_blank" rel="noopener noreferrer">Order on WhatsApp</a>`
    : "";

  return `
    <article class="glass mkt-product-card">
      ${img}
      <div class="mkt-product-body">
        <h3 style="margin:0">${escapeHtml(p.title)}</h3>
        <p class="mkt-product-price">${escapeHtml(p.currency)} ${Number(p.price).toFixed(2)}</p>
        <p class="mkt-product-cat">${escapeHtml(p.category)}</p>
        <p class="mkt-product-seller">by ${escapeHtml(p.seller_name || "")}</p>
      </div>
      <div class="mkt-product-actions">
        <button class="chip" onclick="mktOpenProduct(${Number(p.id)})">View</button>
        ${buyBtn}${waBtn}
      </div>
    </article>`;
}

function renderMktEventCard(e) {
  const poster = e.poster_path
    ? `<img class="mkt-event-poster" src="${mktMediaUrl(e.poster_path)}" alt="${escapeHtml(e.title)}" loading="lazy" />`
    : `<div class="mkt-event-poster-placeholder">🎵</div>`;

  const ticketBtn = e.ticket_url
    ? `<a class="btn btn-primary" href="${escapeHtml(e.ticket_url)}" target="_blank" rel="noopener noreferrer">Get Tickets</a>`
    : "";
  const waBtn = e.whatsapp_url
    ? `<a class="btn btn-outline" href="${escapeHtml(mktBuildWhatsAppUrl(e.whatsapp_url, e.title))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
    : "";

  return `
    <article class="glass mkt-event-card">
      ${poster}
      <div class="mkt-event-body">
        <h3 style="margin:0">${escapeHtml(e.title)}</h3>
        <p class="mkt-event-date">📅 ${mktFormatDate(e.event_date)}${e.start_time ? " · " + mktFormatTime(e.start_time) : ""}</p>
        <p class="mkt-event-venue">${e.venue_name ? "📍 " + escapeHtml(e.venue_name) : ""}${e.location ? " · " + escapeHtml(e.location) : ""}</p>
        <p class="mkt-event-owner">by ${escapeHtml(e.owner_name || "")}</p>
      </div>
      <div class="mkt-event-actions">
        <button class="chip" onclick="mktOpenEvent(${Number(e.id)})">Details</button>
        ${ticketBtn}${waBtn}
      </div>
    </article>`;
}

function renderMktReactions(reactions, targetType, targetId) {
  const emojis = ["❤️","😂","🔥","👍"];
  const counts = {};
  reactions.forEach((r) => { counts[r.emoji] = Number(r.count); });
  return emojis.map((em) => {
    const cnt = counts[em] || 0;
    return `<button class="mkt-reaction-btn" onclick="mktReact('${targetType}',${targetId},'${em}',this)" title="React with ${em}">
      ${em}<span class="mkt-reaction-count">${cnt > 0 ? cnt : ""}</span>
    </button>`;
  }).join("");
}

function mktFireReactionAnimation(btn, emoji) {
  const fly = document.createElement("span");
  fly.className = "reaction-fly";
  fly.textContent = emoji;
  btn.appendChild(fly);
  fly.addEventListener("animationend", () => fly.remove());
}

function renderMktComments(comments) {
  if (!comments.length) return '<p class="release-meta comments-empty">No comments yet. Be the first!</p>';
  return comments.map((c) => `
    <div class="mkt-comment-item">
      <strong class="mkt-comment-author">${escapeHtml(c.stage_name || "User")}</strong>
      <p class="mkt-comment-text">${escapeHtml(c.content)}</p>
      <p class="mkt-comment-time">${new Date(c.created_at).toLocaleString()}</p>
    </div>`).join("");
}

// ── Load functions ───────────────────────────────────────────

window.loadMarketplaceProducts = async function loadMarketplaceProducts(category) {
  const grid = $("mktProductGrid");
  if (!grid) return;
  grid.innerHTML = '<p class="release-meta">Loading...</p>';
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    const data = await api(`/marketplace/products${qs}`);
    grid.innerHTML = data.products.map(renderMktProductCard).join("") ||
      '<div class="empty-state"><p class="empty-state-title">No merchandise available yet.</p><p class="empty-state-text">Be the first to sell on IndieWave.</p></div>';
  } catch (e) {
    grid.innerHTML = `<p class="release-meta">Could not load products: ${escapeHtml(e.message)}</p>`;
  }
};

window.loadMarketplaceEvents = async function loadMarketplaceEvents(status) {
  const grid = $("mktEventGrid");
  if (!grid) return;
  grid.innerHTML = '<p class="release-meta">Loading...</p>';
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await api(`/marketplace/events${qs}`);
    grid.innerHTML = data.events.map(renderMktEventCard).join("") ||
      '<div class="empty-state"><p class="empty-state-title">No upcoming events yet.</p><p class="empty-state-text">Create your first event on IndieWave.</p></div>';
  } catch (e) {
    grid.innerHTML = `<p class="release-meta">Could not load events: ${escapeHtml(e.message)}</p>`;
  }
};

window.mktShowTab = function mktShowTab(tab) {
  const prods = $("mktProductsPane");
  const evts  = $("mktEventsPane");
  const tabs  = document.querySelectorAll("[data-mkt-tab]");
  if (!prods || !evts) return;

  prods.classList.toggle("hidden", tab !== "products");
  evts.classList.toggle("hidden", tab !== "events");
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.mktTab === tab));

  if (tab === "products") loadMarketplaceProducts();
  if (tab === "events")   loadMarketplaceEvents();
};

// ── Product detail ───────────────────────────────────────────

window.mktOpenProduct = async function mktOpenProduct(productId) {
  const dialog = $("mktProductDialog");
  const body   = $("mktProductDialogBody");
  if (!dialog || !body) return;
  body.innerHTML = '<p class="release-meta" style="padding:1rem">Loading...</p>';
  dialog.showModal();
  try {
    const [pd, cd, rd] = await Promise.all([
      api(`/marketplace/products/${productId}`),
      api(`/marketplace/products/${productId}/comments`).catch(() => ({ comments: [] })),
      api(`/marketplace/products/${productId}/reactions`).catch(() => ({ reactions: [] }))
    ]);
    const p = pd.product;
    const img = p.image_path
      ? `<img class="mkt-detail-image" src="${mktMediaUrl(p.image_path)}" alt="${escapeHtml(p.title)}" />`
      : "";
    const buyBtn = p.external_purchase_url
      ? `<a class="btn btn-primary" href="${escapeHtml(p.external_purchase_url)}" target="_blank" rel="noopener noreferrer">Buy Now</a>`
      : "";
    const waBtn = p.whatsapp_contact
      ? `<a class="btn btn-outline" href="${escapeHtml(mktBuildWhatsAppUrl(p.whatsapp_contact, p.title))}" target="_blank" rel="noopener noreferrer">Order on WhatsApp</a>`
      : "";

    body.innerHTML = `
      ${img}
      <div class="mkt-detail-body">
        <h2 class="mkt-detail-title">${escapeHtml(p.title)}</h2>
        <p class="mkt-detail-price">${escapeHtml(p.currency)} ${Number(p.price).toFixed(2)}</p>
        <p class="release-meta">${escapeHtml(p.category)} · ${escapeHtml(p.condition)} · Stock: ${p.stock_quantity}</p>
        <p class="release-meta">Sold by <strong>${escapeHtml(p.seller_name || "")}</strong></p>
        ${p.description ? `<p style="color:var(--muted)">${escapeHtml(p.description)}</p>` : ""}
        <div class="mkt-detail-links">${buyBtn}${waBtn}</div>
        <div class="mkt-reactions-row" id="mktProdReactions${productId}">
          ${renderMktReactions(rd.reactions || [], "product", productId)}
        </div>
        <div class="mkt-comments-section">
          <h4 style="margin:0">Comments (${p.comment_count || 0})</h4>
          <div class="mkt-comments-list" id="mktProdComments${productId}">${renderMktComments(cd.comments || [])}</div>
          ${state.token ? `<form class="mkt-comment-form" onsubmit="mktPostComment(event,'product',${productId})">
            <input type="text" maxlength="1000" placeholder="Write a comment..." required />
            <button class="btn btn-primary" type="submit">Post</button>
          </form>` : `<p class="release-meta">Login to comment.</p>`}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<p class="release-meta" style="padding:1rem">Could not load product: ${escapeHtml(e.message)}</p>`;
  }
};

// ── Event detail ─────────────────────────────────────────────

window.mktOpenEvent = async function mktOpenEvent(eventId) {
  const dialog = $("mktEventDialog");
  const body   = $("mktEventDialogBody");
  if (!dialog || !body) return;
  body.innerHTML = '<p class="release-meta" style="padding:1rem">Loading...</p>';
  dialog.showModal();
  try {
    const [ed, cd, rd] = await Promise.all([
      api(`/marketplace/events/${eventId}`),
      api(`/marketplace/events/${eventId}/comments`).catch(() => ({ comments: [] })),
      api(`/marketplace/events/${eventId}/reactions`).catch(() => ({ reactions: [] }))
    ]);
    const e = ed.event;
    const poster = e.poster_path
      ? `<img class="mkt-detail-image" src="${mktMediaUrl(e.poster_path)}" alt="${escapeHtml(e.title)}" />`
      : "";

    const ticketBtn  = e.ticket_url  ? `<a class="btn btn-primary" href="${escapeHtml(e.ticket_url)}" target="_blank" rel="noopener noreferrer">Get Tickets</a>` : "";
    const waTicket   = e.whatsapp_url ? `<a class="btn btn-outline" href="${escapeHtml(mktBuildWhatsAppUrl(e.whatsapp_url, e.title))}" target="_blank" rel="noopener noreferrer">Get Tickets on WhatsApp</a>` : "";
    const siteBtn    = e.website_url  ? `<a class="btn btn-outline" href="${escapeHtml(e.website_url)}" target="_blank" rel="noopener noreferrer">Visit Event Site</a>` : "";

    // QR: use uploaded qr_code_path if provided, otherwise generate from ticket_url or website_url via Google Charts
    const qrTarget = e.ticket_url || e.website_url || e.whatsapp_url || null;
    let qrSection = "";
    if (e.qr_code_path) {
      qrSection = `<div class="mkt-qr-wrap"><p class="release-meta">Scan for tickets:</p><img src="${mktMediaUrl(e.qr_code_path)}" alt="QR Code" class="mkt-qr-img" /></div>`;
    } else if (qrTarget) {
      const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(qrTarget)}&choe=UTF-8`;
      qrSection = `<div class="mkt-qr-wrap"><p class="release-meta">Scan to ${e.ticket_url ? "buy tickets" : "visit event"}:</p><img src="${qrUrl}" alt="QR Code" class="mkt-qr-img" /></div>`;
    }

    const socialLinks = [
      e.facebook_url  ? `<a href="${escapeHtml(e.facebook_url)}"  target="_blank" rel="noopener noreferrer">Facebook</a>`  : "",
      e.tiktok_url    ? `<a href="${escapeHtml(e.tiktok_url)}"    target="_blank" rel="noopener noreferrer">TikTok</a>`    : "",
      e.instagram_url ? `<a href="${escapeHtml(e.instagram_url)}" target="_blank" rel="noopener noreferrer">Instagram</a>` : "",
      e.website_url   ? `<a href="${escapeHtml(e.website_url)}"   target="_blank" rel="noopener noreferrer">Website</a>`  : ""
    ].filter(Boolean).join("");

    body.innerHTML = `
      ${poster}
      <div class="mkt-detail-body">
        <h2 class="mkt-detail-title">${escapeHtml(e.title)}</h2>
        <p class="mkt-event-date">📅 ${mktFormatDate(e.event_date)}${e.start_time ? " · " + mktFormatTime(e.start_time) : ""}${e.end_time ? " – " + mktFormatTime(e.end_time) : ""}</p>
        ${e.venue_name ? `<p class="mkt-event-venue">📍 ${escapeHtml(e.venue_name)}${e.location ? " · " + escapeHtml(e.location) : ""}</p>` : ""}
        <p class="release-meta">Hosted by <strong>${escapeHtml(e.owner_name || "")}</strong></p>
        ${e.description ? `<p style="color:var(--muted)">${escapeHtml(e.description)}</p>` : ""}
        ${e.ticket_price ? `<p class="release-meta">Tickets from <strong style="color:var(--pink)">${escapeHtml(e.ticket_currency || "ZAR")} ${Number(e.ticket_price).toFixed(2)}</strong>${e.ticket_provider ? " · " + escapeHtml(e.ticket_provider) : ""}</p>` : ""}
        <div class="mkt-detail-links">${ticketBtn}${waTicket}${siteBtn}</div>
        ${qrSection}
        ${socialLinks ? `<div class="mkt-social-links">${socialLinks}</div>` : ""}
        <div class="mkt-reactions-row" id="mktEvtReactions${eventId}">
          ${renderMktReactions(rd.reactions || [], "event", eventId)}
        </div>
        <div class="mkt-comments-section">
          <h4 style="margin:0">Comments (${e.comment_count || 0})</h4>
          <div class="mkt-comments-list" id="mktEvtComments${eventId}">${renderMktComments(cd.comments || [])}</div>
          ${state.token ? `<form class="mkt-comment-form" onsubmit="mktPostComment(event,'event',${eventId})">
            <input type="text" maxlength="1000" placeholder="Write a comment..." required />
            <button class="btn btn-primary" type="submit">Post</button>
          </form>` : `<p class="release-meta">Login to comment.</p>`}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<p class="release-meta" style="padding:1rem">Could not load event: ${escapeHtml(e.message)}</p>`;
  }
};

// ── Reactions ────────────────────────────────────────────────

window.mktReact = async function mktReact(targetType, targetId, emoji, btn) {
  if (!state.token) { notify("Login required to react"); return; }
  try {
    mktFireReactionAnimation(btn, emoji);
    const result = await api(`/marketplace/${targetType}/${targetId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji })
    });
    // Refresh reaction counts
    const rd = await api(`/marketplace/${targetType}/${targetId}/reactions`);
    const container = $(`mkt${targetType === "product" ? "Prod" : "Evt"}Reactions${targetId}`);
    if (container) container.innerHTML = renderMktReactions(rd.reactions || [], targetType, targetId);
  } catch (e) {
    notify(e.message);
  }
};

// ── Comments ─────────────────────────────────────────────────

window.mktPostComment = async function mktPostComment(event, targetType, targetId) {
  event.preventDefault();
  if (!state.token) { notify("Login required to comment"); return; }
  const input = event.target.querySelector("input");
  const content = (input ? input.value : "").trim();
  if (!content) return;
  try {
    await api(`/marketplace/${targetType}/${targetId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (input) input.value = "";
    const cd = await api(`/marketplace/${targetType}/${targetId}/comments`);
    const listId = `mkt${targetType === "product" ? "Prod" : "Evt"}Comments${targetId}`;
    const listEl = $(listId);
    if (listEl) listEl.innerHTML = renderMktComments(cd.comments || []);
  } catch (e) {
    notify(e.message);
  }
};

// ── Create/Manage forms ──────────────────────────────────────

async function submitMktProduct(form) {
  const data = new FormData(form);
  const result = await api("/marketplace/products", { method: "POST", body: data });
  notify(`Product "${result.product.title}" published!`);
  form.reset();
  closeDashboardForm();
  loadMarketplaceProducts();
}

async function submitMktEvent(form) {
  const data = new FormData(form);
  const editingEventId = Number(form.dataset.editingEventId || 0);

  if (editingEventId) {
    const result = await api(`/marketplace/events/${editingEventId}`, {
      method: "PUT",
      body: data
    });
    notify(`Event "${result.event.title}" updated!`);
    delete form.dataset.editingEventId;
  } else {
    const result = await api("/marketplace/events", { method: "POST", body: data });
    notify(`Event "${result.event.title}" published!`);
  }

  form.reset();
  closeDashboardForm();
  loadMarketplaceEvents();
  loadMyMktEvents();
}

async function loadMyMktProducts() {
  if (!state.user) return;
  const grid = $("mktMyProductGrid");
  const panel = $("mktMyProducts");
  if (!grid) return;
  if (panel) panel.classList.remove("hidden");
  try {
    const data = await api(`/marketplace/products?seller_id=${state.user.id}`);
    grid.innerHTML = data.products.map((p) => `
      <article class="glass mkt-manage-card">
        <strong>${escapeHtml(p.title)}</strong>
        <p class="release-meta">${escapeHtml(p.currency)} ${Number(p.price).toFixed(2)} · ${escapeHtml(p.status)}</p>
        <div class="mkt-manage-actions">
          <button class="chip" onclick="mktOpenProduct(${p.id})">View</button>
          <button class="chip btn-danger" onclick="mktDeleteProduct(${p.id})">Delete</button>
        </div>
      </article>`).join("") || '<p class="release-meta">No products yet.</p>';
  } catch (e) {
    if (grid) grid.innerHTML = `<p class="release-meta">${escapeHtml(e.message)}</p>`;
  }
}

async function loadMyMktEvents() {
  if (!state.user) return;
  const grid = $("mktMyEventGrid");
  const panel = $("mktMyEvents");
  if (!grid) return;
  if (panel) panel.classList.remove("hidden");
  try {
    const data = await api("/marketplace/events/mine");
    grid.innerHTML = data.events.map((e) => `
      <article class="glass mkt-manage-card">
        <strong>${escapeHtml(e.title)}</strong>
        <p class="release-meta">📅 ${mktFormatDate(e.event_date)} · ${escapeHtml(e.status)}</p>
        <div class="mkt-manage-actions">
          <button class="chip" onclick="mktOpenEvent(${e.id})">View</button>
          <button class="chip" onclick="mktEditEvent(${e.id})">Edit</button>
          <button class="chip btn-danger" onclick="mktDeleteEvent(${e.id})">Delete</button>
        </div>
      </article>`).join("") || '<p class="release-meta">No events yet.</p>';
  } catch (e) {
    if (grid) grid.innerHTML = `<p class="release-meta">${escapeHtml(e.message)}</p>`;
  }
}

window.mktEditEvent = async function mktEditEvent(id) {
  try {
    const { event } = await api(`/marketplace/events/${id}`);
    const form = $("mktEventForm");
    if (!form || !event) return;

    const fields = {
      title: event.title,
      description: event.description || "",
      event_date: event.event_date || "",
      start_time: event.start_time || "",
      end_time: event.end_time || "",
      venue_name: event.venue_name || "",
      location: event.location || "",
      facebook_url: event.facebook_url || "",
      tiktok_url: event.tiktok_url || "",
      instagram_url: event.instagram_url || "",
      website_url: event.website_url || "",
      whatsapp_url: event.whatsapp_url || "",
      ticket_url: event.ticket_url || "",
      ticket_provider: event.ticket_provider || "",
      ticket_price: event.ticket_price || "",
      ticket_currency: event.ticket_currency || "ZAR",
      status: event.status || "upcoming"
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = form.elements.namedItem(name);
      if (input) input.value = value;
    });

    form.dataset.editingEventId = id;
    showDashboardForm("mktEventForm");
  } catch (error) {
    notify(error.message);
  }
};

window.mktDeleteProduct = async function mktDeleteProduct(id) {
  if (!window.confirm("Delete this product?")) return;
  try {
    await api(`/marketplace/products/${id}`, { method: "DELETE" });
    notify("Product deleted");
    loadMyMktProducts();
    loadMarketplaceProducts();
  } catch (e) { notify(e.message); }
};

window.mktDeleteEvent = async function mktDeleteEvent(id) {
  if (!window.confirm("Delete this event?")) return;
  try {
    await api(`/marketplace/events/${id}`, { method: "DELETE" });
    notify("Event deleted");
    loadMyMktEvents();
    loadMarketplaceEvents();
  } catch (e) { notify(e.message); }
};

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
