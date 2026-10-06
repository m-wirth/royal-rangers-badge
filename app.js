import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("DEIN-PROJEKT") &&
  SUPABASE_ANON_KEY.length > 40;

const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const elements = {
  connection: document.querySelector("#connection-status"),
  holder: document.querySelector("#current-holder"),
  location: document.querySelector("#current-location"),
  time: document.querySelector("#current-time"),
  form: document.querySelector("#badge-form"),
  name: document.querySelector("#person-name"),
  claim: document.querySelector("#claim-button"),
  release: document.querySelector("#release-button"),
  releaseDialog: document.querySelector("#release-dialog"),
  releaseForm: document.querySelector("#release-form"),
  releaseName: document.querySelector("#release-name"),
  confirmRelease: document.querySelector("#confirm-release"),
  message: document.querySelector("#form-message"),
  history: document.querySelector("#history-list"),
  refresh: document.querySelector("#refresh-button"),
};

const locationClasses = {
  GLZ: "location-pill--glz",
  youpj: "location-pill--youpj",
  abwesend: "location-pill--away",
};

function setConnection(mode, text) {
  elements.connection.className = `connection is-${mode}`;
  elements.connection.querySelector("span:last-child").textContent = text;
}

function rememberName(name) {
  localStorage.setItem("badge-finder-name", name);
  elements.name.value = name;
  elements.releaseName.value = name;
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

function timeAgo(value) {
  if (!value) return "Noch nie aktualisiert";
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("de-CH", { numeric: "auto" });
  const ranges = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let duration = seconds;
  for (const [amount, unit] of ranges) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function exactTime(value) {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderState(state) {
  elements.location.className = "location-pill";
  if (!state?.holder_name) {
    elements.location.textContent = "Frei";
    elements.location.classList.add("location-pill--free");
    elements.holder.textContent = "Der Badge ist frei";
    elements.time.textContent = state?.updated_at
      ? `Freigegeben ${timeAgo(state.updated_at)} von ${state.updated_by}`
      : "Bereit für den ersten Eintrag";
    return;
  }
  elements.location.textContent = state.location;
  elements.location.classList.add(locationClasses[state.location] || "location-pill--unknown");
  elements.holder.textContent = `${state.holder_name} hat den Badge`;
  elements.time.textContent = `Aktualisiert ${timeAgo(state.updated_at)}`;
}

function renderHistory(rows = []) {
  if (!rows.length) {
    elements.history.innerHTML = '<li class="history-empty">Noch keine Bewegungen eingetragen.</li>';
    return;
  }
  elements.history.replaceChildren(...rows.map((row) => {
    const item = document.createElement("li");
    item.className = "history-item";
    const marker = document.createElement("span");
    marker.className = `history-marker${row.action === "released" ? " history-marker--release" : ""}`;
    marker.textContent = row.action === "released" ? "✓" : row.location === "GLZ" ? "G" : row.location === "youpj" ? "Y" : "↗";
    const copy = document.createElement("span");
    copy.className = "history-copy";
    const main = document.createElement("strong");
    main.textContent = row.action === "released"
      ? `${row.actor_name} hat den Badge freigegeben`
      : `${row.holder_name} hat den Badge übernommen`;
    const detail = document.createElement("span");
    detail.textContent = row.action === "released" ? "Status: frei" : `Standort: ${row.location}`;
    copy.append(main, detail);
    const time = document.createElement("time");
    time.className = "history-time";
    time.dateTime = row.created_at;
    time.textContent = exactTime(row.created_at);
    item.append(marker, copy, time);
    return item;
  }));
}

function showMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = `form-message${type ? ` is-${type}` : ""}`;
}

async function loadData({ quiet = false } = {}) {
  if (!supabase) return;
  if (!quiet) elements.refresh.classList.add("is-loading");
  const [stateResult, historyResult] = await Promise.all([
    supabase.from("badge_state").select("holder_name, location, updated_by, updated_at").eq("id", 1).maybeSingle(),
    supabase.from("badge_history").select("id, actor_name, holder_name, location, action, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  elements.refresh.classList.remove("is-loading");
  const error = stateResult.error || historyResult.error;
  if (error) {
    setConnection("offline", "Verbindung unterbrochen");
    showMessage("Die Live-Daten konnten nicht geladen werden. Bitte erneut versuchen.", "error");
    return;
  }
  renderState(stateResult.data);
  renderHistory(historyResult.data);
  setConnection("online", "Live verbunden");
}

async function claimBadge(event) {
  event.preventDefault();
  if (!elements.form.reportValidity()) return;
  const name = cleanName(elements.name.value);
  const location = new FormData(elements.form).get("location");
  rememberName(name);
  elements.claim.disabled = true;
  showMessage("Status wird übermittelt …");
  const { error } = await supabase.rpc("claim_badge", { p_holder_name: name, p_location: location });
  elements.claim.disabled = false;
  if (error) return showMessage("Das hat nicht geklappt. Bitte nochmals versuchen.", "error");
  showMessage("Badge-Status ist für alle aktualisiert.", "success");
  await loadData({ quiet: true });
}

async function releaseBadge(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return elements.releaseDialog.close();
  if (!elements.releaseName.reportValidity()) return;
  const name = cleanName(elements.releaseName.value);
  rememberName(name);
  elements.confirmRelease.disabled = true;
  const { error } = await supabase.rpc("release_badge", { p_actor_name: name });
  elements.confirmRelease.disabled = false;
  if (error) {
    elements.releaseDialog.close();
    return showMessage("Der Badge konnte nicht freigegeben werden.", "error");
  }
  elements.releaseDialog.close();
  showMessage("Der Badge ist jetzt als frei markiert.", "success");
  await loadData({ quiet: true });
}

function showConfigurationState() {
  setConnection("offline", "Einrichtung offen");
  elements.holder.textContent = "Datenbank noch nicht verbunden";
  elements.time.textContent = "Supabase-Konfiguration ergänzen";
  elements.form.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
  elements.release.disabled = true;
  elements.history.innerHTML = '<li class="history-empty">Nach der Einrichtung erscheinen hier alle Bewegungen.</li>';
}

const savedName = localStorage.getItem("badge-finder-name") || "";
elements.name.value = savedName;
elements.releaseName.value = savedName;

if (!configured) {
  showConfigurationState();
} else {
  elements.form.addEventListener("submit", claimBadge);
  elements.release.addEventListener("click", () => elements.releaseDialog.showModal());
  elements.releaseForm.addEventListener("submit", releaseBadge);
  elements.refresh.addEventListener("click", () => loadData());
  window.addEventListener("online", () => loadData({ quiet: true }));
  window.addEventListener("offline", () => setConnection("offline", "Offline"));

  loadData();
  supabase
    .channel("badge-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_state" }, () => loadData({ quiet: true }))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "badge_history" }, () => loadData({ quiet: true }))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setConnection("online", "Live verbunden");
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) setConnection("offline", "Neu verbinden …");
    });
  setInterval(() => loadData({ quiet: true }), 30_000);
}
