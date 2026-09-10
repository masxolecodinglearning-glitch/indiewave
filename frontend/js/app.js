const API_BASE = "https://indiewave-09eu.onrender.com/api";
const TERMS_VERSION = "2026-09-06";
const STORAGE_KEY = "indiewave_auth";

const state = {
  token: "",
  user: null,
  sort: "recent",
  trendingSort: "trending",
  releases: [],
  trendingReleases: [],
  currentReleaseId: null,
  currentTrackId: null,
  listeningSessionId: null,
  currentRelease: null,
  currentTrackIndex: null,
  appView: "home",
  genreBucket: "all",
  formatType: "all",
  libraryFormat: "all",
  library: { releases: [], artists: [] },
  commentsReleaseId: null,
  activeConversationId: null,
  activeConversationUser: null,
  messageView: "list",
  conversations: [],
  pendingLikes: new Set(),
  ai: {
    loading: false,
    lastRequest: null,
    lastResponse: "",
    conversationId: null
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

function setUploadStatus(statusText, detail = "", options = {}) {
  const status = $("releaseUploadStatus");
  const statusTextEl = $("releaseUploadStatusText");
  const statusBar = $("releaseUploadStatusBar");
  const statusDetail = $("releaseUploadStatusDetail");
  const statusFile = $("releaseUploadFile");
  const statusProgressText = $("releaseUploadProgressText");
  const retryButton = $("releaseUploadRetryBtn");

  if (!status || !statusTextEl || !statusBar || !statusDetail || !statusFile || !statusProgressText || !retryButton) return;

  const isUpload = /loading|starting.*upload|uploading/i.test(statusText);
  const isProcessing = /processing/i.test(statusText);
  const isComplete = /successfully|completed/i.test(statusText);
  const isFailed = /failed/i.test(statusText);
  const numericPercent = Number.isFinite(options.percent) ? Math.max(0, Math.min(100, options.percent)) : null;

  status.classList.remove("hidden");
  statusTextEl.textContent = statusText;
  statusFile.textContent = detail || "Preparing your upload...";
  statusDetail.textContent = detail || "Preparing your upload...";
  statusProgressText.textContent = numericPercent === null ? "" : `${Math.round(numericPercent)}%`;
  statusBar.classList.toggle("indeterminate", Boolean(options.indeterminate));
  statusBar.classList.toggle("complete", isComplete || isFailed || Boolean(options.complete));
  status.classList.toggle("upload-status-success", isComplete);
  status.classList.toggle("upload-status-error", isFailed);
  status.classList.toggle("upload-status-processing", isProcessing);
  retryButton.classList.toggle("hidden", !isFailed);

  if (options.indeterminate) {
    statusBar.style.width = "70%";
    return;
  }

  if (numericPercent !== null) {
    statusBar.style.width = `${numericPercent}%`;
    return;
  }

  if (isUpload || isProcessing) {
    statusBar.style.width = "15%";
    return;
  }

  statusBar.style.width = "100%";
}

function getReleaseUploadTarget(form) {
  const audioFiles = Array.from(form.querySelector('input[name="audio"]')?.files || []);
  const videoFiles = Array.from(form.querySelector('input[name="video"]')?.files || []);
  const fileName = audioFiles[0]?.name || videoFiles[0]?.name || "Media";

  return {
    hasAudio: audioFiles.length > 0,
    hasVideo: videoFiles.length > 0,
    fileName,
    audioFiles,
    videoFiles
  };
}

function uploadFormDataWithProgress(path, formData, { onProgress, token } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`, true);
    xhr.responseType = "json";
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        if (onProgress) onProgress(null);
        return;
      }

      const percent = Math.max(0, Math.min(100, (event.loaded / event.total) * 100));
      if (onProgress) onProgress(percent);
    });

    xhr.addEventListener("load", () => {
      const payload = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      reject(new Error(payload?.message || "Upload failed"));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error while uploading")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(formData);
  });
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
    <button class="upload-toast-close" aria-label="Close notification">✕</button>
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
    if (result.conversationId) state.ai.conversationId = Number(result.conversationId);
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
    payload: {
      message: text,
      conversationId: state.ai.conversationId,
      requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    },
    responseKey: "response"
  });
  addAiMessage("assistant", response);
}

// Bridges Artist Growth quick prompts into the existing IndieWave AI chat (no new chatbot).
window.askIndieWaveAI = async function askIndieWaveAI(prompt) {
  if (!state.token) {
    $("authDialog")?.showModal();
    return;
  }
  setAppView("ai");
  showAiPanel("chat");
  try {
    await runAiChat(prompt);
  } catch (error) {
    setAiStatus(error.message, true);
  }
};

async function loadAiConversation() {
  if (!state.token || !$('aiConversation')) return;
  try {
    const data = await api("/ai/conversations");
    const conversation = data.conversations?.[0];
    if (!conversation) return;
    const detail = await api(`/ai/conversations/${conversation.id}`);
    state.ai.conversationId = Number(detail.conversation.id);
    $("aiConversation").replaceChildren();
    detail.messages.forEach((message) => addAiMessage(message.role === "assistant" ? "assistant" : "user", message.content));
  } catch (error) {
    setAiStatus("Unable to load AI conversation", true);
  }
}

function startNewAiConversation() {
  state.ai.conversationId = null;
  $("aiConversation")?.replaceChildren();
  setAiStatus("New conversation");
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

  const sidebarAuthBtn = $("sidebarAuthBtn");
  const sidebarLogoutBtn = $("sidebarLogoutBtn");
  if (sidebarAuthBtn) sidebarAuthBtn.classList.toggle("hidden", authenticated);
  if (sidebarLogoutBtn) sidebarLogoutBtn.classList.toggle("hidden", !authenticated);

  $("dashboard").classList.toggle("hidden", state.appView !== "dashboard" || !authenticated || !isArtist);
  $("adminSection").classList.toggle("hidden", state.appView !== "dashboard" || !authenticated || !isAdmin);

  const messagesSection = $("messages");
  if (messagesSection) messagesSection.classList.toggle("hidden", state.appView !== "messages" || !authenticated);

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
  const acceptTermsBtn = $("acceptTermsBtn");
  if (acceptTermsBtn) acceptTermsBtn.classList.toggle("hidden", !authenticated || (state.user?.terms_version === TERMS_VERSION && state.user?.terms_accepted_at));
}

async function acceptCurrentTerms() {
  const data = await api("/auth/terms", { method: "POST" });
  state.user = data.user;
  saveAuth();
  toggleAuthUI();
  notify("Terms accepted");
}

function showHomeView() {
  setAppView("home");
}

function setAppView(view) {
  const views = {
    home: ["welcome", "discover", "newReleases", "countries", "artistCta"],
    search: ["welcome"],
    music: ["discover", "newReleases", "musicTypes"],
    artistProfile: ["artistProfile"],
    library: ["library"],
    artists: ["artists", "newReleases"],
    marketplace: ["marketplace"],
    more: ["moreHub"],
    notifications: ["messages"],
    genres: ["genres", "countries"],
    videos: ["videos"],
    beatSellers: ["beatSellers"],
    messages: ["messages"],
    ai: ["indieWaveAi"],
    artistGrowth: ["artistGrowth"],
    dashboard: ["dashboard", "adminSection"]
  };
  const visibleIds = views[view] || views.home;
  state.appView = views[view] ? view : "home";
  document.querySelectorAll("main > section").forEach((section) => {
    const visible = visibleIds.includes(section.id);
    const adminAllowed = section.id !== "adminSection" || state.user?.role === "admin";
    const artistAllowed = section.id !== "dashboard" || state.user?.role === "artist";
    section.classList.toggle("hidden", !visible || !adminAllowed || !artistAllowed);
  });

  document.querySelectorAll("[data-app-view]").forEach((link) => {
    link.classList.toggle("active", link.dataset.appView === view);
  });

  if (view !== "messages") {
    $("notificationsPanel")?.classList.add("hidden");
  }
  if (view === "home") window.scrollTo({ top: 0, behavior: "auto" });
  else if (view === "dashboard") $("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  else $(visibleIds[0])?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (view === "library") loadLibrary();
}

function showDashboardView() {
  setAppView("dashboard");
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

// Standardized discovery genre taxonomy. releases.genre stays free text in the database;
// this is a safe, additive, frontend-only normalization layer (no destructive migration).
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

const FORMAT_DEFS = [
  { id: "all", label: "All" },
  { id: "single", label: "Singles" },
  { id: "ep", label: "EPs" },
  { id: "album", label: "Albums" },
  { id: "mixtape", label: "Mixtapes" },
  { id: "dj_mix", label: "DJ Mixes" }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive, whitespace/punctuation-safe bucket matching. Anything unmatched
// falls into "other" so no existing release ever disappears from discovery.
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

function filterByGenreBucket(releases) {
  if (!state.genreBucket || state.genreBucket === "all") return releases;
  return releases.filter((release) => normalizeGenreBucket(release.genre) === state.genreBucket);
}

function renderGenreBucketChips() {
  const markup = GENRE_BUCKET_DEFS.map(
    (bucket) =>
      `<button type="button" class="chip${bucket.id === state.genreBucket ? " active" : ""}" data-bucket="${bucket.id}" onclick="selectGenreBucket('${bucket.id}')">${escapeHtml(bucket.label)}</button>`
  ).join("");
  [$("genreChips"), $("africaGenreChips")].forEach((container) => {
    if (container) container.innerHTML = markup;
  });
}

function renderFormatChips() {
  const container = $("formatChips");
  if (!container) return;
  container.innerHTML = FORMAT_DEFS.map(
    (format) =>
      `<button type="button" class="chip${format.id === state.formatType ? " active" : ""}" data-format="${format.id}" onclick="selectFormat('${format.id}')">${escapeHtml(format.label)}</button>`
  ).join("");
}

function wireGenreGridCards() {
  document.querySelectorAll(".genre-card[data-bucket]").forEach((card) => {
    card.classList.toggle("active", card.dataset.bucket === state.genreBucket);
    card.addEventListener("click", () => selectGenreBucket(card.dataset.bucket));
  });
}

window.selectGenreBucket = async function selectGenreBucket(bucketId) {
  state.genreBucket = bucketId;
  document.querySelectorAll("#genreChips .chip[data-bucket]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.bucket === bucketId);
  });
  document.querySelectorAll(".genre-card[data-bucket]").forEach((card) => {
    card.classList.toggle("active", card.dataset.bucket === bucketId);
  });
  await Promise.all([loadReleases(), loadTrendingReleases()]);
};

window.selectFormat = async function selectFormat(formatId) {
  state.formatType = formatId;
  document.querySelectorAll("#formatChips .chip[data-format]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.format === formatId);
  });
  await Promise.all([loadReleases(), loadTrendingReleases()]);
};

function renderLoadError(containerId, retry) {
  const container = $(containerId);
  if (!container) return;
  const retryId = `${containerId}RetryBtn`;
  container.innerHTML = `<div class="empty-state"><p class="empty-state-title">Something went wrong.</p><p class="empty-state-text">We couldn't load this right now. Please try again.</p><button type="button" class="btn btn-outline empty-state-btn" id="${retryId}">Retry</button></div>`;
  $(retryId)?.addEventListener("click", retry);
}

function renderReleaseCard(release, mine = false) {
  const artwork = release.artwork_path ? `<img src="${mediaUrl(release.artwork_path)}" alt="${escapeHtml(release.title)}" />` : "";
  const releaseId = Number(release.id);
  const embedProviderLabel = {
    youtube: "YouTube",
    spotify: "Spotify",
    ditto: "Ditto",
    distrokid: "DistroKid"
  }[release.embed_provider];
  const isPreSaveOnly = release.embed_provider === "ditto" || release.embed_provider === "distrokid";
  const embedBadge = release.content_type === "embed" && embedProviderLabel
    ? `<span class="release-chip-tag">${isPreSaveOnly ? "Pre-Save" : escapeHtml(embedProviderLabel)}</span>`
    : "";
  const trackCount = Number(release.track_count || release.tracks?.length || 0);
  const formatMeta = `${releaseTypeLabel(release.type)}${trackCount > 1 ? ` · ${trackCount} tracks` : ""}`;
  const releaseDate = release.created_at ? new Date(release.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  const actionStop = "event.stopPropagation();";
  const cardOnClick = `onclick="openReleaseDetail(${releaseId})"`;

  return `
    <article class="glass release-card compact-release-card" ${cardOnClick} style="cursor:pointer;">
      <div class="compact-release-main">
        <div class="compact-release-artwork">${artwork}</div>
        <div class="compact-release-copy">
          <div class="compact-release-title-row">
            <h3>${escapeHtml(release.title)}</h3>
            ${embedBadge}
          </div>
          <p class="release-meta release-artist">${escapeHtml(release.stage_name || "Unknown Artist")}</p>
          <p class="release-meta">${escapeHtml(formatMeta)}${releaseDate ? ` · ${escapeHtml(releaseDate)}` : ""}</p>
          <p class="release-meta compact-meta">${escapeHtml(release.genre || "")} · ${escapeHtml(release.country || "")}</p>
        </div>
      </div>
      <div class="release-actions compact-actions">
        <button class="chip" type="button" onclick="${actionStop} playRelease(${releaseId})">Play</button>
        ${isPreSaveOnly ? `<a class="chip" href="${escapeHtml(release.embed_url)}" target="_blank" rel="noopener noreferrer">Pre-Save</a>` : ""}
        <button type="button" class="chip heart-action${release.liked_by_user ? " is-liked" : ""}" aria-label="${release.liked_by_user ? "Unlike" : "Like"} this release" title="${release.liked_by_user ? "Unlike" : "Like"} this release" onclick="${actionStop} likeRelease(${releaseId})">${release.liked_by_user ? "Liked" : "Like"}</button>
        <button class="chip" type="button" onclick="${actionStop} shareRelease(${releaseId})" aria-label="Share release" title="Share release">Share</button>
        <button class="chip" type="button" onclick="${actionStop} showComments(${releaseId})">Comments</button>
        ${mine ? `<button class="chip" type="button" onclick="${actionStop} deleteRelease(${releaseId})">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function renderLibraryEmpty(message, actionLabel = "Explore Music") {
  return `<div class="library-empty-state"><h3>${escapeHtml(message)}</h3><a class="btn btn-primary" href="#discover" data-app-view="music">${escapeHtml(actionLabel)}</a></div>`;
}

function renderLibrary() {
  const releases = filterLibraryReleases(state.library.releases, state.libraryFormat);
  const releaseGrid = $("libraryReleaseGrid");
  const artistGrid = $("libraryArtistGrid");
  if (releaseGrid) releaseGrid.innerHTML = releases.length
    ? releases.map((release) => renderReleaseCard(release)).join("")
    : renderLibraryEmpty(state.library.releases.length ? `No ${libraryFormatLabel(state.libraryFormat).toLowerCase()} saved yet.` : "No saved music yet.");
  if (artistGrid) artistGrid.innerHTML = state.library.artists.length
    ? state.library.artists.map(renderArtistCard).join("")
    : renderLibraryEmpty("No followed artists yet.", "Explore Artists");
}

async function loadLibrary() {
  const releaseGrid = $("libraryReleaseGrid");
  if (!releaseGrid) return;
  if (!state.token) {
    releaseGrid.innerHTML = renderLibraryEmpty("Log in to view your saved music.", "Log In");
    $("libraryArtistGrid").innerHTML = renderLibraryEmpty("Log in to view followed artists.", "Log In");
    return;
  }
  try {
    const data = await api("/social/library");
    state.library = { releases: data.releases || [], artists: data.artists || [] };
    renderLibrary();
  } catch (error) {
    releaseGrid.innerHTML = `<p class="release-meta">${escapeHtml(error.message || "Library unavailable")}</p>`;
  }
}

function renderSearchResults(releases, query) {
  const container = $("searchResults");
  if (!container) return;
  const items = Array.isArray(releases) ? releases : [];
  if (!query) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = items.length
    ? `<p class="search-results-heading">IndieWave releases matching “${escapeHtml(query)}”</p><div class="release-grid">${items.map((release) => renderReleaseCard(release)).join("")}</div>`
    : `<p class="search-results-heading">No IndieWave releases match “${escapeHtml(query)}”.</p>`;
}

function renderArtistCard(artist) {
  const artistName = artist.stage_name || artist.name || "Independent artist";
  const location = [artist.city, artist.country].filter(Boolean).join(" · ");
  const metadata = [location, artist.genre].filter(Boolean);
  const initials = artistName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return `
    <article class="glass artist-card">
      ${artist.profile_image ? `<img src="${mediaUrl(artist.profile_image)}" alt="${escapeHtml(artistName)}" loading="lazy" />` : `<div class="artist-card-avatar" aria-hidden="true">${escapeHtml(initials)}</div>`}
      <h3>${escapeHtml(artistName)}</h3>
      ${metadata.length ? `<p class="release-meta artist-card-meta">${escapeHtml(metadata.join(" · "))}</p>` : ""}
      <div class="release-actions">
        <button class="chip" onclick="viewArtist('${escapeHtml(artist.artist_slug || artist.slug || "")}')">Profile</button>
        ${state.user && Number(artist.artist_id || artist.id) !== Number(state.user.id) ? (artist.is_following ? `<button class="chip" onclick="openConversation(${artist.artist_id || artist.id})">Message</button>` : `<button class="chip" type="button" disabled title="Follow this artist to send a message">Follow to message</button>`) : ""}
        ${state.user ? `<button class=\"chip\" onclick=\"followArtist(${artist.artist_id || artist.id})\">Follow</button>` : ""}
      </div>
    </article>
  `;
}

async function loadReleases(filters = {}) {
  const mergedFilters = { ...filters };
  if (state.formatType && state.formatType !== "all" && mergedFilters.type === undefined) {
    mergedFilters.type = state.formatType;
  }
  const query = new URLSearchParams({ sort: state.sort, ...mergedFilters }).toString();

  let data;
  try {
    data = await api(`/releases?${query}`);
  } catch (error) {
    renderLoadError("releaseGrid", () => loadReleases(filters));
    return;
  }

  const filtered = filterByGenreBucket(data.releases).filter((release) => !filters.city || release.city === filters.city);
  state.releases = filtered;
  if (filters.q !== undefined) renderSearchResults(filtered, filters.q);

  $('releaseGrid').innerHTML =
    filtered.map((release) => renderReleaseCard(release)).join("") ||
    (data.releases.length
      ? '<div class="empty-state"><p class="empty-state-title">No music found in this genre yet.</p><p class="empty-state-text">Try a different genre or format, or explore All.</p></div>'
      : '<div class="empty-state"><p class="empty-state-title">No releases yet.</p><p class="empty-state-text">Upload your music and start building your audience on IndieWave.</p><a href="#dashboard" class="btn btn-primary empty-state-btn">Upload Your Music</a></div>');

  await loadRisingArtists(mergedFilters);

  renderCategoryLists(filtered);
  renderTaxonomy(filtered);
}

async function loadRisingArtists(filters = {}) {
  const container = $("artistGrid");
  if (!container) return;

  const query = new URLSearchParams({ limit: "20", ...filters }).toString();
  try {
    const data = await api(`/artists/rising?${query}`);
    container.innerHTML = (data.artists || []).map(renderArtistCard).join("") || '<p class="release-meta">No rising artists yet.</p>';
  } catch (error) {
    renderLoadError("artistGrid", () => loadRisingArtists(filters));
  }
}

async function loadTrendingReleases(filters = {}) {
  const mergedFilters = { ...filters };
  if (state.formatType && state.formatType !== "all" && mergedFilters.type === undefined) {
    mergedFilters.type = state.formatType;
  }
  const query = new URLSearchParams({ sort: state.trendingSort, ...mergedFilters }).toString();

  if (!$("trendingGrid")) return;

  let data;
  try {
    data = await api(`/releases?${query}`);
  } catch (error) {
    renderLoadError("trendingGrid", () => loadTrendingReleases(filters));
    return;
  }

  const filtered = filterByGenreBucket(data.releases).filter((release) => !filters.city || release.city === filters.city);
  state.trendingReleases = filtered;

  $("trendingGrid").innerHTML =
    filtered.map((release) => renderReleaseCard(release)).join("") ||
    (data.releases.length
      ? '<div class="empty-state"><p class="empty-state-title">No music found in this genre yet.</p><p class="empty-state-text">Try a different genre or format, or explore All.</p></div>'
      : '<div class="empty-state"><p class="empty-state-title">No trending releases yet.</p><p class="empty-state-text">Be the first to upload and get discovered on IndieWave.</p><a href="#dashboard" class="btn btn-primary empty-state-btn">Upload Your Music</a></div>');
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
    $(id).innerHTML = list.slice(0, 6).map((release) => renderReleaseCard(release)).join("") || emptyHtml;
  });
}

function renderTaxonomy(releases) {
  // Genre chips use the standardized GENRE_BUCKET_DEFS taxonomy (rendered once via
  // renderGenreBucketChips) so there is a single genre-filtering system on the page.
  const countries = [...new Set(releases.map((release) => release.country).filter(Boolean))];
  const cities = [...new Set(releases.map((release) => release.city).filter(Boolean))];

  $("countryChips").innerHTML = countries
    .map((country) => `<button class=\"chip\" onclick=\"filterByCountry('${escapeHtml(country)}')\">${escapeHtml(country)}</button>`)
    .join("");
  const cityContainer = $("cityChips");
  if (cityContainer) {
    cityContainer.innerHTML = cities
      .map((city) => `<button class=\"chip\" onclick=\"filterByCity('${escapeHtml(city)}')\">${escapeHtml(city)}</button>`)
      .join("") || '<span class="release-meta">Cities will appear as artists add them to their profiles.</span>';
  }
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
  const data = await api("/releases?type=video");
  $("liveGrid").innerHTML = data.releases
    .map(
      (item) => `
      <article class="glass release-card">
        ${item.artwork_path ? `<img src="${mediaUrl(item.artwork_path)}" alt="${escapeHtml(item.title)}" />` : ""}
        <h3>${escapeHtml(item.title)}</h3>
        <p class="release-meta">${escapeHtml(item.stage_name || "Unknown Artist")} • Plays: ${Number(item.view_count || 0)} • Hearts: ${Number(item.likes || 0)}</p>
        <p>${escapeHtml(item.description || "")}</p>
        ${item.media_video_path ? `<video class="player" controls src="${mediaUrl(item.media_video_path)}" onplay="trackView(${item.id})"></video>` : ""}
        <div class="release-actions"><button class="chip" type="button" onclick="playRelease(${item.id})">Play</button><button class="chip" type="button" onclick="likeRelease(${item.id})">♡ Like</button></div>
      </article>
    `
    )
    .join("");
}

async function loadBeats() {
  const container = $("beatGrid");
  if (!container) return;
  const data = await api("/beats");
  container.innerHTML = (data.beats || []).map((beat) => `
    <article class="glass release-card">
      <img src="${mediaUrl(beat.artwork_path)}" alt="${escapeHtml(beat.title)}" />
      <h3>${escapeHtml(beat.title)}</h3>
      <p class="release-meta">${escapeHtml(beat.seller_name)} • ${escapeHtml(beat.genre)} • ${escapeHtml(beat.currency)} ${Number(beat.price).toFixed(2)}</p>
      <p>${escapeHtml(beat.description || "")}</p>
      <audio class="player" controls preload="metadata" src="${mediaUrl(beat.audio_path)}"></audio>
    </article>
  `).join("") || '<p class="release-meta">No beats published yet.</p>';
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
  await loadBeats();
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

function stripAudioExtension(filename) {
  return String(filename || "").replace(/\.[^/.]+$/, "");
}

function syncReleaseTrackQueueFromInput() {
  const input = document.getElementById("releaseAudioInput");
  const queue = Array.from(input?.files || []).map((file, index) => ({
    id: `${file.name}-${index}-${file.lastModified || Date.now()}`,
    file,
    title: stripAudioExtension(file.name) || `Track ${index + 1}`
  }));
  state.releaseTrackQueue = queue;
  renderReleaseTrackList();
}

function renderReleaseTrackList() {
  const container = document.getElementById("releaseTrackList");
  if (!container) return;

  if (!state.releaseTrackQueue.length) {
    container.innerHTML = '<p class="release-meta">Select one or more MP3 files to build your release tracklist.</p>';
    return;
  }

  container.innerHTML = state.releaseTrackQueue.map((track, index) => `
    <div class="release-track-row" data-track-row-id="${escapeHtml(track.id)}">
      <div class="release-track-number">${index + 1}</div>
      <div class="release-track-main">
        <div class="release-track-file">${escapeHtml(track.file.name)}</div>
        <input type="text" value="${escapeHtml(track.title)}" data-track-title-index="${index}" placeholder="Track title" aria-label="Track title for ${escapeHtml(track.file.name)}" />
      </div>
      <button type="button" class="chip" data-track-remove-index="${index}">Remove</button>
    </div>
  `).join("");

  container.querySelectorAll("input[data-track-title-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const idx = Number(event.target.dataset.trackTitleIndex);
      if (Number.isInteger(idx) && state.releaseTrackQueue[idx]) {
        state.releaseTrackQueue[idx].title = event.target.value.trim() || stripAudioExtension(state.releaseTrackQueue[idx].file.name) || `Track ${idx + 1}`;
      }
    });
  });

  container.querySelectorAll("button[data-track-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.trackRemoveIndex);
      if (Number.isInteger(idx)) {
        state.releaseTrackQueue.splice(idx, 1);
        const input = document.getElementById("releaseAudioInput");
        const dataTransfer = new DataTransfer();
        state.releaseTrackQueue.forEach((track) => dataTransfer.items.add(track.file));
        if (input) input.files = dataTransfer.files;
        renderReleaseTrackList();
      }
    });
  });
}

async function uploadBeat(form) {
  const data = new FormData(form);
  try {
    await api("/beats", { method: "POST", body: data });
    notify("Beat published");
    form.reset();
    await loadBeats();
  } catch (error) {
    notify(error.message);
  }
}

function syncReleaseTrackTitlesIntoForm(form) {
  const existing = form.querySelectorAll('input[name="trackTitles"]').forEach((input) => input.remove());
  if (!state.releaseTrackQueue.length) return;

  state.releaseTrackQueue.forEach((track) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "trackTitles";
    input.value = track.title.trim() || stripAudioExtension(track.file.name) || "Untitled Track";
    form.appendChild(input);
  });
}

async function uploadRelease(form) {
  const type = form.elements.type?.value;
  const price = Number(form.elements.price?.value);
  if (["ep", "album", "mixtape"].includes(type) && (price < 50 || price > 70)) {
    notify(`${type.toUpperCase()} prices must be between R50 and R70.`);
    return null;
  }
  if (!Number.isFinite(price) || price < 0) {
    notify("A valid non-negative price is required.");
    return null;
  }

  syncReleaseTrackTitlesIntoForm(form);
  const data = new FormData(form);
  const uploadTarget = getReleaseUploadTarget(form);
  const isSongUpload = uploadTarget.hasAudio;
  const statusPrefix = isSongUpload ? "Song" : "Video";
  const loadingStatus = isSongUpload ? "⌛ Song loading..." : "⏳ Video loading...";
  const processingStatus = isSongUpload ? "⌛ Song loading..." : "⏳ Video loading...";
  const successStatus = isSongUpload ? "✅ Song uploaded successfully" : "✅ Video uploaded successfully";
  const failedStatus = isSongUpload ? "❌ Song upload failed" : "❌ Video upload failed";

  setUploadStatus(loadingStatus, uploadTarget.fileName, { indeterminate: true });

  try {
    const response = await uploadFormDataWithProgress("/releases", data, {
      token: state.token,
      onProgress: (percent) => {
        if (percent === null) {
          setUploadStatus(loadingStatus, uploadTarget.fileName, { indeterminate: true });
          return;
        }

        setUploadStatus(loadingStatus, uploadTarget.fileName, { percent });
      }
    });

    setUploadStatus(processingStatus, uploadTarget.fileName, { indeterminate: true });
    setUploadStatus(successStatus, uploadTarget.fileName, { percent: 100, complete: true });
    showUploadNotification(
      "success",
      "✓ Upload complete",
      response?.release?.title ? `Your release “${response.release.title}” has been uploaded successfully.` : `${statusPrefix} uploaded successfully.`
    );

    await loadReleases();
    await loadMyDashboard();
    form.reset();
    state.releaseTrackQueue = [];
    renderReleaseTrackList();
    return response;
  } catch (error) {
    console.error("Upload release failed:", error);
    const safeMessage = typeof error?.message === "string" && !/(credential|secret|stack trace|database|r2|internal|path|server)/i.test(error.message)
      ? error.message
      : "Please try again.";

    setUploadStatus(failedStatus, safeMessage, { percent: 100, complete: true });
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
  state.currentRelease = release;
  state.currentTrackId = null;
  state.currentTrackIndex = null;
  state.listeningSessionId = null;
  $('nowPlayingTitle').textContent = `${release.title} - ${release.stage_name}`;

  // Handle embedded content (YouTube, Spotify) and pre-save links (Ditto, DistroKid)
  if (release.content_type === 'embed' && release.embed_provider && release.embed_id) {
    // Stop any playing audio/video
    const audio = $("musicPlayer");
    const video = $("videoPlayer");
    if (audio) audio.pause();
    if (video) {
      video.pause();
      video.classList.add("hidden");
    }

    updateGlobalPlayer(release);

    // Show the embed in the now playing dialog
    const dialog = $("nowPlayingDialog");
    if (dialog) {
      const embedHtml = renderEmbedContent(release);
      const contentArea = dialog.querySelector('.now-playing-embed-content') || (() => {
        const div = document.createElement('div');
        div.className = 'now-playing-embed-content';
        dialog.insertBefore(div, dialog.querySelector('.now-playing-progress'));
        return div;
      })();
      contentArea.innerHTML = embedHtml;
      dialog.showModal();
    }

    trackView(releaseId).catch(() => {});
    return;
  }

  // Handle regular uploads (audio/video)
  updateGlobalPlayer(release);
  const hasVideo = Boolean(release.media_video_path);
  const audio = $("musicPlayer");
  const video = $("videoPlayer");

  if (audio) {
    audio.dataset.playRecorded = "false";
    audio.dataset.playRecordedFor = "";
  }

  if (hasVideo) {
    audio.pause();
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
  video.pause();
  const nextSrc = mediaUrl(release.media_audio_path);
  if (audio.src !== nextSrc) {
    audio.src = nextSrc;
    audio.load();
  }
  audio.play().catch(() => {});
  updateVisualizerState();
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function updateGlobalPlayer(release) {
  const player = $("globalPlayer");
  if (!player || !release) return;
  player.classList.remove("hidden");
  const artwork = release.artwork_path ? mediaUrl(release.artwork_path) : "";
  [$("globalPlayerArtwork"), $("nowPlayingArtwork")].forEach((image) => {
    if (!image) return;
    image.src = artwork;
    image.classList.toggle("hidden", !artwork);
    image.alt = artwork ? `${release.title} artwork` : "";
  });
  [$("globalPlayerTitle"), $("nowPlayingDialogTitle")].forEach((element) => {
    if (element) element.textContent = release.title || "Untitled release";
  });
  [$("globalPlayerArtist"), $("nowPlayingDialogArtist")].forEach((element) => {
    if (element) element.textContent = release.stage_name || "Unknown Artist";
  });
  syncPlayerControls();
}

function syncPlayerProgress() {
  const audio = $("musicPlayer");
  if (!audio) return;
  const percentage = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  [$("globalProgress"), $("nowPlayingProgress")].forEach((input) => {
    if (input) input.value = String(percentage);
  });
  [$("globalCurrentTime"), $("nowPlayingCurrentTime")].forEach((element) => {
    if (element) element.textContent = formatTime(audio.currentTime);
  });
  [$("globalDuration"), $("nowPlayingDuration")].forEach((element) => {
    if (element) element.textContent = formatTime(audio.duration);
  });

  const releaseId = Number(state.currentReleaseId);
  if (!releaseId || audio.currentTime < 30 || audio.dataset.playRecorded === "true") return;

  audio.dataset.playRecorded = "true";
  if (state.currentTrackId && state.listeningSessionId) {
    trackListenForTrack(releaseId, state.currentTrackId, audio.currentTime, state.listeningSessionId).catch(() => {});
    return;
  }

  trackListen(releaseId).catch(() => {});
}

function syncPlayerControls() {
  const audio = $("musicPlayer");
  const label = audio && !audio.paused ? "Pause" : "Play";
  [$("globalPlayBtn"), $("nowPlayingPlayBtn")].forEach((button) => {
    if (button) {
      button.textContent = label;
      button.setAttribute("aria-label", label);
    }
  });
}

function togglePlayerPlayback() {
  const audio = $("musicPlayer");
  if (!audio || !state.currentRelease) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function seekPlayer(value) {
  const audio = $("musicPlayer");
  if (audio && Number.isFinite(audio.duration)) audio.currentTime = (Number(value) / 100) * audio.duration;
}

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

window.trackListenForTrack = async function trackListenForTrack(releaseId, trackId, elapsedSeconds, sessionId) {
  const result = await api(`/engagement/releases/${releaseId}/tracks/${trackId}/listen`, {
    method: "POST",
    body: JSON.stringify({ elapsedSeconds, sessionId })
  });

  if (result.recorded) {
    const count = document.getElementById(`release-track-play-count-${releaseId}-${trackId}`);
    if (count) {
      count.dataset.playCount = String(Number(count.dataset.playCount || 0) + 1);
      count.textContent = `Plays: ${count.dataset.playCount}`;
    }
  }
  return result;
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

function buildReleaseTrackLabel(release, index) {
  const tracks = Array.isArray(release?.tracks) ? release.tracks : [];
  const track = tracks[index] || null;
  if (track && track.title) return track.title;
  if (release && release.title) return `${release.title} ${index + 1}`;
  return `Track ${index + 1}`;
}

function buildReleaseTrackSource(release, index = 0) {
  const tracks = Array.isArray(release?.tracks) ? release.tracks : [];
  const track = tracks[index] || null;
  if (track && track.audio_path) return mediaUrl(track.audio_path);
  if (release && release.media_audio_path) return mediaUrl(release.media_audio_path);
  return "";
}

function getTrackActionKey(releaseId, trackIndex = 0) {
  return `${Number(releaseId)}:${Number(trackIndex)}`;
}

function createListeningSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `listen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

window.openReleaseDetail = async function openReleaseDetail(releaseId) {
  try {
    const match = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId));
    const data = match && Array.isArray(match.tracks) ? { release: match } : await api(`/releases/${releaseId}`);
    const release = data.release;
    if (!release) return;

    const dialog = document.getElementById("releaseDetailDialog");
    if (!dialog) return;

    const releaseTitle = release.title || "Untitled release";
    const releaseInitials = String(releaseTitle).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const artworkFallback = `<div class="release-detail-artwork-fallback"${release.artwork_path ? " hidden" : ""}><span>INDIEWAVE</span><strong>${escapeHtml(releaseInitials || "IW")}</strong><small>${escapeHtml(releaseTypeLabel(release.type))}</small></div>`;
    const artwork = `<div class="release-detail-artwork">${release.artwork_path ? `<img src="${escapeHtml(mediaUrl(release.artwork_path))}" alt="${escapeHtml(releaseTitle)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />` : ""}${artworkFallback}</div>`;
    const tracks = Array.isArray(release.tracks) && release.tracks.length ? release.tracks : (release.media_audio_path ? [{ id: null, title: release.title, audio_path: release.media_audio_path }] : []);

    dialog.innerHTML = `
      <button type="button" class="form-close" onclick="closeReleaseDetail()" aria-label="Close release details">✕</button>
      <div style="display:grid;gap:16px;">
        ${artwork}
        <div>
          <p class="section-kicker">${escapeHtml(releaseTypeLabel(release.type))}</p>
          <h2>${escapeHtml(releaseTitle)}</h2>
          <p class="release-meta">${release.artist_slug ? `<button type="button" class="release-detail-artist-link" onclick="event.stopPropagation(); viewArtist('${escapeHtml(release.artist_slug)}')">${escapeHtml(release.stage_name || "Unknown Artist")}</button>` : escapeHtml(release.stage_name || "Unknown Artist")} • ${escapeHtml(release.genre || "")}${release.genre && release.country ? " • " : ""}${escapeHtml(release.country || "")}</p>
        </div>
        <div class="release-detail-track-list">
          ${tracks.map((track, index) => `
            <div class="release-detail-track">
              <span class="release-meta release-detail-track-index">#${index + 1}</span>
              <div class="release-detail-track-copy">
                <strong>${escapeHtml(track.title || buildReleaseTrackLabel(release, index))}</strong>
                <span id="release-track-play-count-${release.id}-${track.id || `fallback-${index}`}" class="release-meta" data-play-count="${Number(track.listen_count || 0)}">Plays: ${Number(track.listen_count || 0)}</span>
              </div>
              <div class="release-detail-track-actions">
                <button type="button" class="chip" onclick="event.stopPropagation(); playTrackFromRelease(${release.id}, ${index})">Play</button>
                <button type="button" class="chip heart-action" aria-label="Like this track" title="Like this track" data-track-like="${release.id}-${index}" onclick="event.stopPropagation(); likeTrackFromRelease(${release.id}, ${index})">♡</button>
                <button type="button" class="chip" onclick="event.stopPropagation(); shareTrackFromRelease(${release.id}, ${index})" aria-label="Share track" title="Share track">↗ Share</button>
                <button type="button" class="chip" onclick="event.stopPropagation(); showTrackComments(${release.id}, ${index})">Comments</button>
              </div>
            </div>
          `).join("") || '<p class="release-meta">No tracks available.</p>'}
        </div>
      </div>
    `;

    dialog.showModal();
  } catch (error) {
    notify(error.message || "This release is unavailable.");
  }
};

window.closeReleaseDetail = function closeReleaseDetail() {
  const dialog = document.getElementById("releaseDetailDialog");
  if (dialog) dialog.close();
};

window.playTrackFromRelease = async function playTrackFromRelease(releaseId, trackIndex = 0) {
  let release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId));
  if (!release) {
    try {
      const data = await api(`/releases/${releaseId}`);
      release = data.release;
    } catch (error) {
      notify(error.message || "This release is unavailable.");
      return;
    }
  }

  if (!release) return;
  const trackTitle = buildReleaseTrackLabel(release, trackIndex);
  const track = Array.isArray(release.tracks) ? release.tracks[trackIndex] : null;
  const audioSrc = buildReleaseTrackSource(release, trackIndex);
  const playbackRelease = {
    ...release,
    title: trackTitle,
    media_audio_path: audioSrc ? audioSrc.replace(/^https?:.*\/api\/media\//, "") : release.media_audio_path
  };

  state.currentReleaseId = Number(releaseId);
  state.currentRelease = playbackRelease;
  state.currentTrackIndex = Number(trackIndex);
  state.currentTrackKey = getTrackActionKey(releaseId, trackIndex);
  state.currentTrackId = track && track.id ? Number(track.id) : null;
  state.listeningSessionId = state.currentTrackId ? createListeningSessionId() : null;

  const audio = document.getElementById("musicPlayer");
  if (audio) {
    audio.dataset.playRecorded = "false";
    audio.dataset.playRecordedFor = "";
    if (audioSrc) {
      if (audio.src !== audioSrc) {
        audio.src = audioSrc;
        audio.load();
      }
      audio.play().catch(() => {});
    }
  }

  updateGlobalPlayer(playbackRelease);
  const nowPlayingTitle = document.getElementById("nowPlayingDialogTitle");
  const nowPlayingArtist = document.getElementById("nowPlayingDialogArtist");
  if (nowPlayingTitle) nowPlayingTitle.textContent = trackTitle;
  if (nowPlayingArtist) nowPlayingArtist.textContent = `${release.stage_name || "Unknown Artist"}`;
};

window.shareTrackFromRelease = async function shareTrackFromRelease(releaseId, trackIndex = 0) {
  let release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId)) || state.currentRelease;

  if (!release) {
    try {
      const data = await api(`/releases/${releaseId}`);
      release = data.release;
    } catch (error) {
      notify(error.message || "This release is unavailable.");
      return;
    }
  }

  const trackTitle = buildReleaseTrackLabel(release, trackIndex);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "#home";
  url.searchParams.set("release", String(releaseId));
  url.searchParams.set("track", String(trackIndex));

  const shareData = {
    title: trackTitle || release.title || "IndieWave release",
    text: `${trackTitle || release.title || "Release"} by ${release.stage_name || "Unknown Artist"} on IndieWave`,
    url: url.toString()
  };

  await window.shareIndieWaveUrl({ ...shareData, contentLabel: "this track" });
};

window.downloadTrackFromRelease = async function downloadTrackFromRelease(releaseId, trackIndex = 0) {
  let release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId)) || state.currentRelease;
  if (!release) {
    try {
      const data = await api(`/releases/${releaseId}`);
      release = data.release;
    } catch (error) {
      notify(error.message || "This release is unavailable.");
      return;
    }
  }

  const trackSrc = buildReleaseTrackSource(release, trackIndex);
  if (trackSrc) {
    window.open(trackSrc, "_blank", "noopener,noreferrer");
    return;
  }

  await window.downloadRelease(releaseId);
};

window.downloadRelease = async function downloadRelease(releaseId) {
  try {
    const result = await api(`/engagement/releases/${releaseId}/download`, { method: "POST" });
    if (result.downloadUrl) window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    notify(error.message);
  }
};

window.shareIndieWaveUrl = async function shareIndieWaveUrl({ url, title, text, contentLabel = "this IndieWave link" }) {
  const shareData = { title, text, url };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "native";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text || title}\n${url}`)}`;
  if (window.confirm(`Open WhatsApp to share ${contentLabel}?`)) {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    return "whatsapp";
  }

  try {
    await navigator.clipboard.writeText(url);
    notify("Link copied");
    return "clipboard";
  } catch (error) {
    window.prompt(`Copy ${contentLabel}`, url);
    return "prompt";
  }
};

window.shareRelease = async function shareRelease(releaseId) {
  let release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId)) || state.currentRelease;

  if (!release) {
    try {
      const data = await api(`/releases/${releaseId}`);
      release = data.release;
    } catch (error) {
      notify(error.message || "This release is unavailable.");
      return;
    }
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "#home";
  url.searchParams.set("release", String(releaseId));
  const shareData = {
    title: release.title || "IndieWave release",
    text: `${release.title || "Release"} by ${release.stage_name || "Unknown Artist"} on IndieWave`,
    url: url.toString()
  };

  await window.shareIndieWaveUrl({ ...shareData, contentLabel: "this release" });
};

async function openSharedRelease() {
  const releaseParam = new URLSearchParams(window.location.search).get("release");
  if (!releaseParam || !/^\d+$/.test(releaseParam)) return;

  try {
    const data = await api(`/releases/${releaseParam}`);
    const release = data.release;
    state.releases = [release, ...state.releases.filter((item) => Number(item.id) !== Number(release.id))];
    state.currentRelease = release;
    renderSearchResults([release], "Shared release");
    const trackParam = new URLSearchParams(window.location.search).get("track");
    const trackIndex = Number(trackParam);
    if (Array.isArray(release.tracks) && Number.isInteger(trackIndex) && trackIndex >= 0 && trackIndex < release.tracks.length) {
      await window.playTrackFromRelease(release.id, trackIndex);
    } else {
      window.playRelease(release.id);
    }
    document.getElementById("searchResults")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    notify("This release is unavailable.");
  }
}

window.likeRelease = async function likeRelease(releaseId) {
  if (!state.token) {
    notify("Login required");
    return;
  }
  const key = `release:${releaseId}`;
  if (state.pendingLikes.has(key)) return;
  state.pendingLikes.add(key);
  try {
    const result = await api(`/social/releases/${releaseId}/like`, { method: "POST" });
    notify(result.liked ? "Release liked" : "Like removed");
    await loadReleases();
    await loadTrendingReleases();
    await loadLibrary();
  } finally {
    state.pendingLikes.delete(key);
  }
};

window.likeTrackFromRelease = async function likeTrackFromRelease(releaseId, trackIndex = 0) {
  if (!state.token) {
    notify("Login required");
    return;
  }

  const key = `track:${releaseId}:${trackIndex}`;
  if (state.pendingLikes.has(key)) return;
  state.pendingLikes.add(key);

  try {
    const release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId));
    const track = release && Array.isArray(release.tracks) ? release.tracks[trackIndex] : null;
    if (!track || !track.id) {
      notify("Track engagement is unavailable");
      return;
    }

    const result = await api(`/social/tracks/${track.id}/like`, { method: "POST" });
    const button = document.querySelector(`[data-track-like="${releaseId}-${trackIndex}"]`);
    if (button) {
      button.textContent = result.liked ? "♥" : "♡";
      button.classList.toggle("is-liked", result.liked);
      button.setAttribute("aria-label", `${result.liked ? "Unlike" : "Like"} this track`);
      button.title = `${result.liked ? "Unlike" : "Like"} this track`;
    }
    notify(result.liked ? "Track liked" : "Track like removed");
  } finally {
    state.pendingLikes.delete(key);
  }
};

window.showTrackComments = async function showTrackComments(releaseId, trackIndex = 0) {
  const release = (state.currentRelease && Number(state.currentRelease.id) === Number(releaseId) ? state.currentRelease : null) || [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId));
  const track = release && Array.isArray(release.tracks) ? release.tracks[trackIndex] : null;
  if (!track || !track.id) {
    notify("Track comments are unavailable");
    return;
  }

  const data = await api(`/social/tracks/${track.id}/comments`);
  const text = data.comments.length
    ? data.comments.map((comment) => `${comment.stage_name}: ${comment.content}`).join("\n")
    : "No comments yet";
  const newComment = window.prompt(`Comments for ${track.title}:\n${text}\n\nWrite a comment (optional):`, "");
  if (!newComment) return;
  if (!state.token) {
    notify("Login required to comment");
    return;
  }
  await api(`/social/tracks/${track.id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: newComment })
  });
  notify("Track comment added");
};

window.followArtist = async function followArtist(artistId) {
  if (!state.token) {
    notify("Login required");
    return;
  }
  const result = await api(`/social/artists/${artistId}/follow`, { method: "POST" });
  notify(result.followed ? "Artist followed" : "Unfollowed");
  await loadLibrary();
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
  await selectGenreBucket(normalizeGenreBucket(genre));
};

window.filterByCountry = async function filterByCountry(country) {
  await loadReleases({ country });
  await loadTrendingReleases({ country });
};

window.filterByCity = async function filterByCity(city) {
  await loadReleases({ city });
  await loadTrendingReleases({ city });
};

window.viewArtist = async function viewArtist(slug) {
  if (!slug) return;
  try {
    const profile = await api(`/artists/${slug}`);
    const artist = profile.artist || {};
    const artistName = artist.stage_name || artist.name || "Independent artist";
    const location = [artist.city, artist.country].filter(Boolean).join(" · ");
    const metadata = [location, artist.genre].filter(Boolean);
    const initials = artistName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const releases = Array.isArray(profile.releases) ? profile.releases : [];
    state.releases = [...releases, ...state.releases.filter((release) => !releases.some((item) => Number(item.id) === Number(release.id)))];
    $("artistProfile").innerHTML = `
      <div class="artist-profile-hero glass">
        ${artist.profile_image ? `<img src="${mediaUrl(artist.profile_image)}" alt="${escapeHtml(artistName)}" />` : `<div class="artist-profile-avatar" aria-hidden="true">${escapeHtml(initials)}</div>`}
        <div class="artist-profile-copy">
          <p class="section-kicker">IndieWave artist</p>
          <h1>${escapeHtml(artistName)}</h1>
          ${metadata.length ? `<p class="artist-profile-meta">${escapeHtml(metadata.join(" · "))}</p>` : ""}
          ${artist.bio ? `<p class="artist-profile-bio">${escapeHtml(artist.bio)}</p>` : ""}
          <div class="artist-profile-stats">
            ${profile.stats?.followers != null ? `<span>${escapeHtml(String(profile.stats.followers))} followers</span>` : ""}
            ${profile.stats?.releases != null ? `<span>${escapeHtml(String(profile.stats.releases))} releases</span>` : ""}
          </div>
        </div>
      </div>
      <div class="section-title-row artist-profile-heading"><div><p class="section-kicker">Artist catalogue</p><h2>Releases</h2></div></div>
      <div class="release-grid">${releases.length ? releases.map((release) => renderReleaseCard(release)).join("") : '<div class="empty-state"><p class="empty-state-title">No releases yet.</p><p class="empty-state-text">This artist has not published music on IndieWave yet.</p></div>'}</div>
    `;
    setAppView("artistProfile");
  } catch (error) {
    notify(error.message || "Artist profile unavailable");
  }
};

window.openReportForRelease = function openReportForRelease(releaseId) {
  const form = $("reportForm");
  form.targetType.value = "release";
  form.targetId.value = releaseId;
  form.scrollIntoView({ behavior: "smooth" });
};

window.openReportForTrack = function openReportForTrack(releaseId, trackIndex = 0) {
  const release = [...state.releases, ...state.trendingReleases].find((item) => Number(item.id) === Number(releaseId));
  const track = release && Array.isArray(release.tracks) ? release.tracks[trackIndex] : null;
  if (!track || !track.id) {
    notify("Track reporting is unavailable");
    return;
  }
  const form = $("reportForm");
  form.targetType.value = "track";
  form.targetId.value = track.id;
  form.scrollIntoView({ behavior: "smooth" });
};

/**
 * Toggle between upload and embed content types in the release form
 */
window.toggleReleaseContentType = function toggleReleaseContentType(type) {
  const uploadSection = $("releaseUploadSection");
  const embedSection = $("releaseEmbedSection");
  const previewContainer = $("embedPreviewContainer");

  if (type === "embed") {
    if (uploadSection) uploadSection.classList.add("hidden");
    if (embedSection) embedSection.classList.remove("hidden");
  } else {
    if (uploadSection) uploadSection.classList.remove("hidden");
    if (embedSection) embedSection.classList.add("hidden");
    if (previewContainer) {
      previewContainer.classList.add("hidden");
      previewContainer.innerHTML = "";
    }
  }
};

/**
 * Client-side URL detection for IndieWave Embed preview only.
 * The backend independently re-validates and normalizes the URL on submit,
 * so this is purely a UX preview and never trusted for storage.
 */
function detectEmbedPlatform(rawUrl) {
  try {
    let normalizedUrl = String(rawUrl || "").trim();
    if (!normalizedUrl) return null;
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

    const urlObj = new URL(normalizedUrl);
    if (urlObj.protocol !== "https:") return null;
    const hostname = urlObj.hostname;

    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      const match = normalizedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
      if (match) return { provider: "youtube", embedId: match[1], normalizedUrl };
      return null;
    }

    if (hostname.includes("spotify.com") || hostname.includes("spotify.link")) {
      const pathMatch = urlObj.pathname.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
      if (pathMatch) return { provider: "spotify", embedId: pathMatch[2], normalizedUrl };
      if (hostname.includes("spotify.link")) {
        const linkMatch = urlObj.pathname.match(/^\/([a-zA-Z0-9]+)/);
        if (linkMatch) return { provider: "spotify", embedId: linkMatch[1], normalizedUrl };
      }
      return null;
    }

    if (hostname.includes("ditto.fm")) {
      const path = urlObj.pathname.replace(/^\//, "");
      if (path) return { provider: "ditto", embedId: path, normalizedUrl };
      return null;
    }

    if (hostname.includes("distrokid.com") || hostname.includes("hyperfollow.com")) {
      const path = urlObj.pathname.replace(/^\//, "");
      if (path) return { provider: "distrokid", embedId: path, normalizedUrl };
      return null;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Handle "Detect Platform" button: shows platform name and safe embed preview.
 */
function handleDetectPlatform() {
  const input = $("embedUrlInput");
  const previewContainer = $("embedPreviewContainer");
  if (!input || !previewContainer) return;

  const detected = detectEmbedPlatform(input.value);
  if (!detected) {
    previewContainer.classList.remove("hidden");
    previewContainer.innerHTML = `<p class="embed-label">Unsupported URL</p><p class="form-note">Please paste a valid YouTube, Spotify, Ditto or DistroKid link.</p>`;
    return;
  }

  const providerLabel = {
    youtube: "YouTube",
    spotify: "Spotify",
    ditto: "Ditto",
    distrokid: "DistroKid"
  }[detected.provider] || "External";

  const embedHtml = generateEmbedHtml(detected.provider, detected.embedId);
  previewContainer.classList.remove("hidden");
  if (embedHtml) {
    previewContainer.innerHTML = `<p class="embed-label">Platform: ${escapeHtml(providerLabel)}</p>${embedHtml}`;
  } else {
    const link = generateExternalLink(detected.provider, detected.normalizedUrl);
    previewContainer.innerHTML = `<p class="embed-label">Platform: ${escapeHtml(providerLabel)}</p><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline embed-link">${escapeHtml(link.label)}</a>`;
  }
}

/**
 * Generate embed HTML for different providers
 */
function generateEmbedHtml(provider, embedId) {
  if (!embedId) return null;

  switch (provider) {
    case 'youtube':
      return `<iframe width="100%" height="400" src="https://www.youtube-nocookie.com/embed/${escapeHtml(embedId)}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="max-width: 100%; border-radius: 8px;"></iframe>`;

    case 'spotify':
      return `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${escapeHtml(embedId)}?utm_source=generator" width="100%" height="352" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;

    // Ditto and DistroKid are pre-save/promotional links only, not embedded players
    case 'ditto':
    case 'distrokid':
      return null;

    default:
      return null;
  }
}

/**
 * Generate external link for embed content
 */
function generateExternalLink(provider, embedUrl) {
  if (!embedUrl) return null;

  const labels = {
    youtube: 'Watch on YouTube',
    spotify: 'Listen on Spotify',
    ditto: 'Ditto Pre-Save',
    distrokid: 'DistroKid Pre-Save'
  };

  return {
    label: labels[provider] || 'Open External',
    url: embedUrl
  };
}

/**
 * Render embed content in the release card
 */
function renderEmbedContent(release) {
  if (!release.embed_provider || !release.embed_id) return '';

  const embedHtml = generateEmbedHtml(release.embed_provider, release.embed_id);
  const link = generateExternalLink(release.embed_provider, release.embed_url);
  const providerLabel = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    ditto: 'Ditto',
    distrokid: 'DistroKid'
  }[release.embed_provider] || 'External';
  const isPreSaveOnly = release.embed_provider === 'ditto' || release.embed_provider === 'distrokid';

  const artwork = release.artwork_path
    ? `<img class="embed-artwork" src="${escapeHtml(mediaUrl(release.artwork_path))}" alt="${escapeHtml(release.title || "Release")} artwork" />`
    : '';
  let html = `<div class="embed-container"><p class="embed-label">${isPreSaveOnly ? 'Pre-Save via' : 'Embedded from'} ${escapeHtml(providerLabel)}</p>${artwork}`;
  if (embedHtml) {
    html += embedHtml;
  }
  if (link && link.url) {
    html += `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline embed-link">${escapeHtml(link.label)}</a>`;
  }
  html += '</div>';

  return html;
}

/**
 * Updated playRelease to handle embeds
 */


function wireEvents() {
  $("openAuthBtn").addEventListener("click", () => $("authDialog").showModal());
  $("closeAuthBtn").addEventListener("click", () => $("authDialog").close());

  $("sidebarAuthBtn")?.addEventListener("click", () => $("authDialog").showModal());
  $("sidebarLogoutBtn")?.addEventListener("click", () => $("logoutBtn").click());

  document.querySelectorAll("[data-app-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.appView;
      if ((view === "dashboard" || view === "messages") && !state.token) {
        $("authDialog").showModal();
        return;
      }
      if (view === "dashboard" && state.user?.role !== "artist") {
        notify("Artist workspace requires an artist account");
        return;
      }
      setAppView(view);
    });
  });

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

  $("acceptTermsBtn")?.addEventListener("click", async () => {
    try {
      await acceptCurrentTerms();
    } catch (error) {
      notify(error.message);
    }
  });

  const releaseForm = $("releaseForm");
  const handleReleaseUploadSubmit = async () => {
    const uploadResult = await uploadRelease(releaseForm);
    if (uploadResult) {
      await loadTrendingReleases();
    }
  };

  releaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleReleaseUploadSubmit();
  });

  $("releaseUploadRetryBtn")?.addEventListener("click", async () => {
    await handleReleaseUploadSubmit();
  });

  $("beatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await uploadBeat(event.target);
  });

  const releaseAudioInput = $("releaseAudioInput");
  if (releaseAudioInput) {
    releaseAudioInput.addEventListener("change", () => {
      syncReleaseTrackQueueFromInput();
    });
  }

  const detectPlatformBtn = $("detectPlatformBtn");
  if (detectPlatformBtn) {
    detectPlatformBtn.addEventListener("click", handleDetectPlatform);
  }

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

  let searchTimer;
  $("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = $("searchInput").value.trim();
    searchTimer = setTimeout(async () => {
      try {
        await loadReleases(query ? { q: query } : {});
        await loadTrendingReleases(query ? { q: query } : {});
      } catch (error) {
        notify(error.message);
      }
    }, 180);
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

  document.querySelectorAll(".library-format-chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".library-format-chip").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      state.libraryFormat = button.dataset.libraryFormat;
      renderLibrary();
    });
  });

  renderGenreBucketChips();
  renderFormatChips();
  wireGenreGridCards();

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
    $("aiNewConversationBtn").addEventListener("click", startNewAiConversation);
    loadAiConversation();

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
        const regenerateRequest = {
          ...state.ai.lastRequest,
          payload: {
            ...state.ai.lastRequest.payload,
            requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
          }
        };
        const response = await sendAiRequest(regenerateRequest);
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
      syncPlayerControls();
    });
    audio.addEventListener("pause", () => {
      updateVisualizerState();
      syncPlayerControls();
    });
    audio.addEventListener("timeupdate", () => {
      syncPlayerProgress();
    });
    audio.addEventListener("loadedmetadata", syncPlayerProgress);
    audio.addEventListener("durationchange", syncPlayerProgress);
  }

  // Prev / Next track buttons
  const prevBtn = $("prevTrackBtn");
  const nextBtn = $("nextTrackBtn");
  if (prevBtn) prevBtn.addEventListener("click", prevTrack);
  if (nextBtn) nextBtn.addEventListener("click", nextTrack);

  [$("globalPrevBtn"), $("nowPlayingPrevBtn")].forEach((button) => button?.addEventListener("click", prevTrack));
  [$("globalNextBtn"), $("nowPlayingNextBtn")].forEach((button) => button?.addEventListener("click", nextTrack));
  [$("globalPlayBtn"), $("nowPlayingPlayBtn")].forEach((button) => button?.addEventListener("click", togglePlayerPlayback));
  [$("globalProgress"), $("nowPlayingProgress")].forEach((input) => input?.addEventListener("input", (event) => seekPlayer(event.target.value)));
  const volume = $("globalVolume");
  if (volume && audio) volume.addEventListener("input", () => { audio.volume = Number(volume.value); });

  const nowPlayingDialog = $("nowPlayingDialog");
  $("globalExpandBtn")?.addEventListener("click", () => {
    if (nowPlayingDialog && state.currentRelease && !nowPlayingDialog.open) nowPlayingDialog.showModal();
  });
  $("nowPlayingCloseBtn")?.addEventListener("click", () => nowPlayingDialog?.close());

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
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  const installAppBtn = document.getElementById("installAppBtn");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installAppBtn) {
      installAppBtn.classList.remove("hidden");
    }
  });

  if (installAppBtn) {
    installAppBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        notify("Install is not available in this browser yet. On iPhone or iPad, use Share > Add to Home Screen.");
        return;
      }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installAppBtn.classList.add("hidden");
    });
  }

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
    setAppView("home");
    await openSharedRelease();
    await initializeData();
  } catch (error) {
    notify(error.message);
  }
}

bootstrap();
