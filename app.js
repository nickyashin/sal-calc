/**
 * app.js
 * לוגיקת ממשק משתמש, תבניות משמרת בלחיצה אחת + הקלדה אוטומטית (Auto-Advance),
 * יתרות צבורות של חופשה ומחלה, התקנת PWA למסך הבית,
 * סנכרון Firebase בזמן אמת, חגי ישראל (Hebcal), ויבוא מאקסל (SheetJS).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  DEFAULT_SETTINGS,
  SHIFT_TEMPLATES,
  mergeSettings,
  calculateMonthSummary,
  calculateLeaveBalances,
  getHourlyRateForDate,
  formatCurrency,
  formatHours
} from "./salaryCalculator.js";

// ============================================================================
// Constants & State
// ============================================================================
const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

const HEBREW_WEEKDAYS = [
  "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"
];

const LS_KEYS = {
  FIREBASE_CONFIG: "lts_anna_firebase_config_v1",
  SETTINGS: "lts_anna_settings_v1",
  MONTH_PREFIX: "lts_anna_month_v1_",
  HOLIDAYS_PREFIX: "lts_anna_holidays_v1_"
};

const now = new Date();
const state = {
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  settings: loadLocalSettings(),
  daysData: {},
  allMonthsMap: loadAllLocalMonths(), // { "YYYY-MM": { "YYYY-MM-DD": entry } } לחישוב יתרות חופשה ומחלה
  holidaysByYear: {},
  editingDateStr: null,
  db: null,
  unsubMonth: null,
  unsubAllMonths: null,
  unsubSettings: null,
  saveTimer: null,
  isWritingCloud: false,
  deferredInstallPrompt: null,
  hasScrolledToTodayOnce: false
};

// ============================================================================
// DOM References
// ============================================================================
const els = {
  syncDot: document.getElementById("syncDot"),
  syncText: document.getElementById("syncText"),
  prevMonthBtn: document.getElementById("prevMonthBtn"),
  nextMonthBtn: document.getElementById("nextMonthBtn"),
  monthSelect: document.getElementById("monthSelect"),
  yearSelect: document.getElementById("yearSelect"),
  jumpTodayBtn: document.getElementById("jumpTodayBtn"),
  installPwaBtn: document.getElementById("installPwaBtn"),
  importExcelBtn: document.getElementById("importExcelBtn"),
  excelFileInput: document.getElementById("excelFileInput"),
  openGlobalSettingsBtn: document.getElementById("openGlobalSettingsBtn"),

  // Summary
  sumTotalHours: document.getElementById("sumTotalHours"),
  sumCashGross: document.getElementById("sumCashGross"),
  sumTaxableGross: document.getElementById("sumTaxableGross"),
  sumNetToBank: document.getElementById("sumNetToBank"),
  sumVacBalance: document.getElementById("sumVacBalance"),
  sumSickBalance: document.getElementById("sumSickBalance"),
  toggleBreakdownBtn: document.getElementById("toggleBreakdownBtn"),
  toggleBreakdownLabel: document.getElementById("toggleBreakdownLabel"),
  summaryBreakdown: document.getElementById("summaryBreakdown"),
  bdWorkGross: document.getElementById("bdWorkGross"),
  bdTravel: document.getElementById("bdTravel"),
  bdCashGross: document.getElementById("bdCashGross"),
  bdTenBis: document.getElementById("bdTenBis"),
  bdHealthImputedRow: document.getElementById("bdHealthImputedRow"),
  bdHealthImputed: document.getElementById("bdHealthImputed"),
  bdTaxableGross: document.getElementById("bdTaxableGross"),
  bdIncomeTax: document.getElementById("bdIncomeTax"),
  bdNationalInsurance: document.getElementById("bdNationalInsurance"),
  bdHealthTax: document.getElementById("bdHealthTax"),
  bdPensionPctLabel: document.getElementById("bdPensionPctLabel"),
  bdPension: document.getElementById("bdPension"),
  bdTotalDeductions: document.getElementById("bdTotalDeductions"),
  bdHoursMeta: document.getElementById("bdHoursMeta"),
  bdVacationDetail: document.getElementById("bdVacationDetail"),
  bdSickDetail: document.getElementById("bdSickDetail"),

  // Days List
  daysList: document.getElementById("daysList"),

  // Day Modal
  dayModal: document.getElementById("dayModal"),
  dayModalTitle: document.getElementById("dayModalTitle"),
  dayModalSubtitle: document.getElementById("dayModalSubtitle"),
  daySettingsForm: document.getElementById("daySettingsForm"),
  dayStatusSelect: document.getElementById("dayStatusSelect"),
  sickOverrideGroup: document.getElementById("sickOverrideGroup"),
  daySickOverrideSelect: document.getElementById("daySickOverrideSelect"),
  shiftTypeGroup: document.getElementById("shiftTypeGroup"),
  dayShiftTypeSelect: document.getElementById("dayShiftTypeSelect"),
  dayOverrideRateInput: document.getElementById("dayOverrideRateInput"),
  dayDefaultRateHint: document.getElementById("dayDefaultRateHint"),
  clearDayBtn: document.getElementById("clearDayBtn"),

  // Global Settings Modal
  globalModal: document.getElementById("globalModal"),
  globalSettingsForm: document.getElementById("globalSettingsForm"),
  cfgStandardHours: document.getElementById("cfgStandardHours"),
  cfgShortenedHours: document.getElementById("cfgShortenedHours"),
  cfgShortenedWeekday: document.getElementById("cfgShortenedWeekday"),
  cfgNightHours: document.getElementById("cfgNightHours"),
  cfgShabbatPercent: document.getElementById("cfgShabbatPercent"),
  cfgStartDate: document.getElementById("cfgStartDate"),
  cfgVacAccrual: document.getElementById("cfgVacAccrual"),
  cfgSickAccrual: document.getElementById("cfgSickAccrual"),
  cfgVacOpening: document.getElementById("cfgVacOpening"),
  cfgSickOpening: document.getElementById("cfgSickOpening"),
  wageTiersContainer: document.getElementById("wageTiersContainer"),
  addWageTierBtn: document.getElementById("addWageTierBtn"),
  cfgTravel: document.getElementById("cfgTravel"),
  cfgTenBis: document.getElementById("cfgTenBis"),
  cfgHealthImputed: document.getElementById("cfgHealthImputed"),
  cfgCreditPoints: document.getElementById("cfgCreditPoints"),
  cfgCreditPointValue: document.getElementById("cfgCreditPointValue"),
  cfgPensionPercent: document.getElementById("cfgPensionPercent"),
  taxBracketsContainer: document.getElementById("taxBracketsContainer"),
  openFirebaseSetupFromSettingsBtn: document.getElementById("openFirebaseSetupFromSettingsBtn"),
  resetDefaultSettingsBtn: document.getElementById("resetDefaultSettingsBtn"),

  // Firebase Setup Modal
  firebaseSetupModal: document.getElementById("firebaseSetupModal"),
  firebaseConfigForm: document.getElementById("firebaseConfigForm"),
  firebaseConfigTextarea: document.getElementById("firebaseConfigTextarea"),
  clearLocalFirebaseConfigBtn: document.getElementById("clearLocalFirebaseConfigBtn"),

  toastContainer: document.getElementById("toastContainer")
};

// ============================================================================
// Initialization & PWA Registration
// ============================================================================
async function init() {
  populateMonthYearSelects();
  bindEvents();
  initPwaSupport();

  state.daysData = loadLocalMonth(state.year, state.month);
  state.allMonthsMap[getMonthKey(state.year, state.month)] = state.daysData;
  renderMonthUI();

  const holidaysPromise = ensureHolidaysForYear(state.year);
  const firebasePromise = initFirebaseConnection();

  await holidaysPromise;
  renderMonthUI();
  scrollToTodayIfCurrentMonth();

  await firebasePromise;
}

function initPwaSupport() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("Service Worker registration skipped:", err);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    els.installPwaBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    els.installPwaBtn.hidden = true;
    showToast("האפליקציה הותקנה למסך הבית", "success");
  });

  els.installPwaBtn.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      els.installPwaBtn.hidden = true;
    }
    state.deferredInstallPrompt = null;
  });
}

function populateMonthYearSelects() {
  els.monthSelect.innerHTML = HEBREW_MONTHS.map(
    (name, idx) => `<option value="${idx + 1}">${name}</option>`
  ).join("");
  els.monthSelect.value = String(state.month);

  const startYear = 2025;
  const endYear = Math.max(2032, now.getFullYear() + 4);
  const yearOptions = [];
  for (let y = startYear; y <= endYear; y++) {
    yearOptions.push(`<option value="${y}">${y}</option>`);
  }
  els.yearSelect.innerHTML = yearOptions.join("");
  els.yearSelect.value = String(state.year);
}

function bindEvents() {
  els.prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
  els.nextMonthBtn.addEventListener("click", () => shiftMonth(1));
  els.monthSelect.addEventListener("change", () => {
    setMonthYear(Number(els.yearSelect.value), Number(els.monthSelect.value));
  });
  els.yearSelect.addEventListener("change", () => {
    setMonthYear(Number(els.yearSelect.value), Number(els.monthSelect.value));
  });
  els.jumpTodayBtn.addEventListener("click", async () => {
    const today = new Date();
    const targetYear = today.getFullYear();
    const targetMonth = today.getMonth() + 1;
    if (state.year !== targetYear || state.month !== targetMonth) {
      await setMonthYear(targetYear, targetMonth);
    }
    scrollToToday(true);
  });

  els.toggleBreakdownBtn.addEventListener("click", () => {
    const isExpanded = els.toggleBreakdownBtn.getAttribute("aria-expanded") === "true";
    els.toggleBreakdownBtn.setAttribute("aria-expanded", String(!isExpanded));
    els.summaryBreakdown.hidden = isExpanded;
    els.toggleBreakdownLabel.textContent = isExpanded ? "פירוט מלא" : "הסתר פירוט";
  });

  els.importExcelBtn.addEventListener("click", () => els.excelFileInput.click());
  els.excelFileInput.addEventListener("change", handleExcelImport);

  els.openGlobalSettingsBtn.addEventListener("click", openGlobalSettingsModal);
  els.addWageTierBtn.addEventListener("click", () => addWageTierRow({ effectiveFrom: "", rate: 55 }));
  els.globalSettingsForm.addEventListener("submit", handleGlobalSettingsSave);
  els.resetDefaultSettingsBtn.addEventListener("click", handleResetDefaultSettings);
  els.openFirebaseSetupFromSettingsBtn.addEventListener("click", () => {
    closeModal("globalModal");
    openFirebaseSetupModal();
  });

  els.dayStatusSelect.addEventListener("change", updateDayModalVisibility);
  els.daySettingsForm.addEventListener("submit", handleDaySettingsSave);
  els.clearDayBtn.addEventListener("click", handleClearDay);

  els.firebaseConfigForm.addEventListener("submit", handleFirebaseConfigSubmit);
  els.clearLocalFirebaseConfigBtn.addEventListener("click", () => {
    localStorage.removeItem(LS_KEYS.FIREBASE_CONFIG);
    els.firebaseConfigTextarea.value = "";
    setSyncStatus("offline", "מקומי בלבד");
    showToast("מפתח Firebase נמחק ממכשיר זה", "success");
    closeModal("firebaseSetupModal");
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  [els.dayModal, els.globalModal, els.firebaseSetupModal].forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.hidden = true;
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      els.dayModal.hidden = true;
      els.globalModal.hidden = true;
      els.firebaseSetupModal.hidden = true;
    }
  });
}

// ============================================================================
// Firebase Zero-Friction Sync (Dynamic Config + LocalStorage Fallback)
// ============================================================================
async function resolveFirebaseConfig() {
  try {
    const mod = await import("./firebase-config.js");
    if (mod?.firebaseConfig?.apiKey && !mod.firebaseConfig.apiKey.includes("YOUR_")) {
      return mod.firebaseConfig;
    }
  } catch {
    // firebase-config.js אינו קיים (למשל ב-GitHub Pages)
  }

  const storedRaw = localStorage.getItem(LS_KEYS.FIREBASE_CONFIG);
  if (storedRaw) {
    try {
      const parsed = JSON.parse(storedRaw);
      if (parsed?.apiKey && parsed?.projectId) {
        return parsed;
      }
    } catch {
      localStorage.removeItem(LS_KEYS.FIREBASE_CONFIG);
    }
  }

  return null;
}

async function initFirebaseConnection() {
  const config = await resolveFirebaseConfig();
  if (!config) {
    setSyncStatus("offline", "לא מחובר לענן");
    openFirebaseSetupModal();
    return;
  }

  try {
    setSyncStatus("syncing", "מתחבר לענן...");
    const app = initializeApp(config);
    state.db = getFirestore(app);

    subscribeToGlobalSettings();
    subscribeToAllMonthsForBalances();
    subscribeToMonth(state.year, state.month);
  } catch (err) {
    console.error("Firebase init failed:", err);
    setSyncStatus("offline", "שגיאת חיבור");
    showToast("שגיאה בחיבור ל-Firebase. העבודה ממשיכה בשמירה מקומית.", "error");
  }
}

function subscribeToGlobalSettings() {
  if (!state.db) return;
  if (state.unsubSettings) state.unsubSettings();

  const settingsRef = doc(state.db, "settings", "global");
  state.unsubSettings = onSnapshot(
    settingsRef,
    (snap) => {
      if (snap.exists()) {
        const remote = snap.data();
        if (remote?.settings) {
          state.settings = mergeSettings(remote.settings);
          saveLocalSettings(state.settings);
          renderMonthUI();
        }
      }
    },
    (err) => {
      console.error("Settings snapshot error:", err);
    }
  );
}

/**
 * האזנה לכלל החודשים בענן לצורך חישוב מדויק של יתרות חופשה ומחלה צבורות
 */
function subscribeToAllMonthsForBalances() {
  if (!state.db) return;
  if (state.unsubAllMonths) state.unsubAllMonths();

  const monthsCol = collection(state.db, "months");
  state.unsubAllMonths = onSnapshot(
    monthsCol,
    (querySnap) => {
      const merged = { ...loadAllLocalMonths() };
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.days) {
          merged[docSnap.id] = data.days;
        }
      });
      state.allMonthsMap = merged;
      renderLeaveBalancesOnly();
    },
    (err) => {
      console.error("All months balance sync error:", err);
    }
  );
}

function subscribeToMonth(year, month) {
  if (!state.db) return;
  if (state.unsubMonth) state.unsubMonth();

  const monthKey = getMonthKey(year, month);
  const monthRef = doc(state.db, "months", monthKey);
  setSyncStatus("syncing", "מסנכרן...");

  state.unsubMonth = onSnapshot(
    monthRef,
    (snap) => {
      // מניעת דריסה של עריכה/מחיקה מקומית בזמן שהיא בתהליך שמירה לענן
      if (state.saveTimer !== null || state.isWritingCloud || snap.metadata.hasPendingWrites) {
        return;
      }
      if (snap.exists()) {
        const remoteDays = { ...(snap.data()?.days || {}) };
        state.daysData = remoteDays;
        state.allMonthsMap[monthKey] = remoteDays;
        saveLocalMonth(year, month, remoteDays);
        renderMonthUI();
      } else {
        const localDays = loadLocalMonth(year, month);
        state.daysData = localDays;
        state.allMonthsMap[monthKey] = localDays;
        renderMonthUI();
      }
      setSyncStatus("synced", "מסונכרן");
    },
    (err) => {
      console.error("Month snapshot error:", err);
      setSyncStatus("offline", "מצב לא מקוון");
    }
  );
}

function scheduleMonthSave(year = state.year, month = state.month, data = state.daysData) {
  const snapshotData = JSON.parse(JSON.stringify(data));
  const monthKey = getMonthKey(year, month);
  state.allMonthsMap[monthKey] = snapshotData;
  saveLocalMonth(year, month, snapshotData);

  if (!state.db) {
    setSyncStatus("offline", "שמור מקומית");
    return;
  }

  setSyncStatus("syncing", "שומר...");
  if (state.saveTimer) clearTimeout(state.saveTimer);

  state.saveTimer = setTimeout(async () => {
    state.saveTimer = null;
    await persistMonthToCloud(year, month, snapshotData);
  }, 350);
}

async function saveMonthNow(year = state.year, month = state.month, data = state.daysData) {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }
  const snapshotData = JSON.parse(JSON.stringify(data));
  const monthKey = getMonthKey(year, month);
  state.allMonthsMap[monthKey] = snapshotData;
  saveLocalMonth(year, month, snapshotData);

  if (!state.db) {
    setSyncStatus("offline", "שמור מקומית");
    return;
  }

  setSyncStatus("syncing", "שומר...");
  await persistMonthToCloud(year, month, snapshotData);
}

async function persistMonthToCloud(year, month, data) {
  if (!state.db) return;
  state.isWritingCloud = true;
  try {
    const monthKey = getMonthKey(year, month);
    const monthRef = doc(state.db, "months", monthKey);
    await setDoc(
      monthRef,
      {
        year,
        month,
        days: data,
        updatedAt: serverTimestamp()
      }
    );
    setSyncStatus("synced", "מסונכרן");
  } catch (err) {
    console.error("Firestore save error:", err);
    setSyncStatus("offline", "שמירה מקומית");
    showToast("אין חיבור לענן כרגע — הנתונים נשמרו במכשיר.", "error");
  } finally {
    state.isWritingCloud = false;
  }
}

async function persistSettingsToCloud(settings) {
  saveLocalSettings(settings);
  if (!state.db) return;

  const serializable = {
    ...settings,
    taxBrackets: settings.taxBrackets.map((b) => ({
      upTo: b.upTo === Infinity ? null : b.upTo,
      rate: b.rate
    }))
  };

  try {
    setSyncStatus("syncing", "שומר הגדרות...");
    await setDoc(
      doc(state.db, "settings", "global"),
      { settings: serializable, updatedAt: serverTimestamp() }
    );
    setSyncStatus("synced", "מסונכרן");
  } catch (err) {
    console.error("Settings save error:", err);
    setSyncStatus("offline", "שמור מקומית");
  }
}

function openFirebaseSetupModal() {
  const existing = localStorage.getItem(LS_KEYS.FIREBASE_CONFIG);
  els.firebaseConfigTextarea.value = existing ? JSON.stringify(JSON.parse(existing), null, 2) : "";
  els.firebaseSetupModal.hidden = false;
}

function parseFlexibleFirebaseConfig(rawText) {
  const trimmed = rawText.trim();
  try {
    const obj = JSON.parse(trimmed);
    if (obj?.apiKey && obj?.projectId) return obj;
  } catch {
    // המשך לפרסר אובייקט JS
  }

  const startIdx = trimmed.indexOf("{");
  const endIdx = trimmed.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("לא נמצא אובייקט קונפיגורציה תקין");
  }

  const objectSlice = trimmed.slice(startIdx, endIdx + 1);
  const normalizedJson = objectSlice
    .replace(/\/\/.*$/gm, "")
    .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,\s*}/g, "}");

  const parsed = JSON.parse(normalizedJson);
  if (!parsed.apiKey || !parsed.projectId) {
    throw new Error("חסרים שדות חובה (apiKey / projectId)");
  }
  return parsed;
}

async function handleFirebaseConfigSubmit(e) {
  e.preventDefault();
  try {
    const config = parseFlexibleFirebaseConfig(els.firebaseConfigTextarea.value);
    localStorage.setItem(LS_KEYS.FIREBASE_CONFIG, JSON.stringify(config));
    closeModal("firebaseSetupModal");
    showToast("הגדרות Firebase נשמרו — מתחבר לענן...", "success");
    window.location.reload();
  } catch (err) {
    showToast(`קונפיגורציה לא תקינה: ${err.message}`, "error");
  }
}

function setSyncStatus(mode, text) {
  els.syncDot.className = `sync-dot ${mode}`;
  els.syncText.textContent = text;
}

// ============================================================================
// Hebcal API — Israeli Holidays
// ============================================================================
async function ensureHolidaysForYear(year) {
  if (state.holidaysByYear[year]) return state.holidaysByYear[year];

  const cacheKey = `${LS_KEYS.HOLIDAYS_PREFIX}${year}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      state.holidaysByYear[year] = JSON.parse(cached);
      return state.holidaysByYear[year];
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }

  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&lg=he&year=${year}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const map = {};
    for (const item of data.items || []) {
      if (!item.date) continue;
      const dateStr = item.date.slice(0, 10);
      const isIndependenceDay =
        item.title_orig === "Yom HaAtzma'ut" ||
        (typeof item.title === "string" && item.title.includes("יום העצמאות"));
      const isOfficialHoliday = Boolean(item.yomtov) || isIndependenceDay;

      if (!map[dateStr] || isOfficialHoliday) {
        map[dateStr] = {
          title: item.title || item.hebrew || "חג",
          isOfficialHoliday
        };
      }
    }

    state.holidaysByYear[year] = map;
    localStorage.setItem(cacheKey, JSON.stringify(map));
    return map;
  } catch (err) {
    console.warn("Hebcal API fetch failed:", err);
    state.holidaysByYear[year] = {};
    return {};
  }
}

// ============================================================================
// Month Switching & Rendering
// ============================================================================
async function setMonthYear(year, month) {
  state.year = year;
  state.month = month;
  els.monthSelect.value = String(month);
  els.yearSelect.value = String(year);

  state.daysData = loadLocalMonth(year, month);
  state.allMonthsMap[getMonthKey(year, month)] = state.daysData;
  await ensureHolidaysForYear(year);
  renderMonthUI();

  if (state.db) {
    subscribeToMonth(year, month);
  }
}

function shiftMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  setMonthYear(y, m);
}

function renderMonthUI() {
  const holidaysMap = state.holidaysByYear[state.year] || {};
  const summary = calculateMonthSummary(
    state.year,
    state.month,
    state.daysData,
    holidaysMap,
    state.settings
  );

  renderSummaryCard(summary);
  renderLeaveBalancesOnly();
  renderDaysList(summary, holidaysMap);
}

function renderLeaveBalancesOnly() {
  const balances = calculateLeaveBalances(
    state.year,
    state.month,
    state.allMonthsMap,
    state.settings
  );

  els.sumVacBalance.textContent = balances.vacation.remaining.toFixed(2);
  els.sumSickBalance.textContent = balances.sick.remaining.toFixed(2);

  els.bdVacationDetail.textContent = `נצברו ${balances.vacation.accrued.toFixed(
    2
  )} · נוצלו ${balances.vacation.used} · יתרה ${balances.vacation.remaining.toFixed(2)}`;
  els.bdSickDetail.textContent = `נצברו ${balances.sick.accrued.toFixed(
    2
  )} · נוצלו ${balances.sick.used} · יתרה ${balances.sick.remaining.toFixed(2)}`;
}

function renderSummaryCard(summary) {
  const t = summary.totals;

  els.sumTotalHours.textContent = formatHours(t.totalHours);
  els.sumCashGross.textContent = `${formatCurrency(t.cashGross)} ₪`;
  els.sumTaxableGross.textContent = `${formatCurrency(t.taxableGross)} ₪`;
  els.sumNetToBank.textContent = `${formatCurrency(t.netToBank)} ₪`;

  els.bdWorkGross.textContent = `${formatCurrency(t.totalWorkGross)} ₪`;
  els.bdTravel.textContent = `${formatCurrency(t.travelAllowance)} ₪`;
  els.bdCashGross.textContent = `${formatCurrency(t.cashGross)} ₪`;
  els.bdTenBis.textContent = `${formatCurrency(t.tenBisValue)} ₪`;

  if (t.healthInsuranceImputed > 0) {
    els.bdHealthImputedRow.hidden = false;
    els.bdHealthImputed.textContent = `${formatCurrency(t.healthInsuranceImputed)} ₪`;
  } else {
    els.bdHealthImputedRow.hidden = true;
  }

  els.bdTaxableGross.textContent = `${formatCurrency(t.taxableGross)} ₪`;
  els.bdIncomeTax.textContent = `-${formatCurrency(t.incomeTax)} ₪`;
  els.bdNationalInsurance.textContent = `-${formatCurrency(t.nationalInsurance)} ₪`;
  els.bdHealthTax.textContent = `-${formatCurrency(t.healthTax)} ₪`;
  els.bdPensionPctLabel.textContent = String(state.settings.pensionEmployeePercent);
  els.bdPension.textContent = `-${formatCurrency(t.employeePension)} ₪`;
  els.bdTotalDeductions.textContent = `-${formatCurrency(t.totalDeductions)} ₪`;

  const ot150Plus = t.totalOt150Hours + t.totalOt175Hours + t.totalOt200Hours;
  els.bdHoursMeta.textContent = `${formatCurrency(t.totalPensionableSalary)} ₪ · ${formatHours(
    t.totalRegularHours
  )} / ${formatHours(t.totalOt125Hours)} / ${formatHours(ot150Plus)}`;
}

function renderDaysList(summary, holidaysMap) {
  const activeEl = document.activeElement;
  const activeKey = activeEl?.dataset?.focusKey || null;

  const todayStr = getTodayDateStr();
  const fragment = document.createDocumentFragment();

  for (let day = 1; day <= summary.daysInMonth; day++) {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = state.daysData[dateStr] || {};
    const dayRes = summary.dailyResults[dateStr];
    const holidayInfo = holidaysMap[dateStr];
    const weekdayIdx = new Date(state.year, state.month - 1, day).getDay();
    const isShabbat = weekdayIdx === 6;
    const isToday = dateStr === todayStr;
    const isNonWorkStatus = entry.status === "vacation" || entry.status === "sick";

    const row = document.createElement("div");
    row.className = "day-row";
    row.dataset.date = dateStr;
    row.setAttribute("role", "listitem");

    if (isShabbat || weekdayIdx === 5) row.classList.add("is-weekend");
    if (isToday) row.classList.add("is-today");
    if (entry.status === "vacation") row.classList.add("is-vacation");
    if (entry.status === "sick") row.classList.add("is-sick");

    const hasCustomOverride =
      (entry.status && entry.status !== "work") ||
      (entry.overrideShiftType && entry.overrideShiftType !== "auto") ||
      (entry.overrideRate !== undefined && entry.overrideRate !== null && entry.overrideRate !== "") ||
      (entry.sickDayNumberOverride !== undefined && entry.sickDayNumberOverride !== "");

    // תא תאריך + תגיות
    const dateCell = document.createElement("div");
    dateCell.className = "day-date-cell";

    const dateNum = document.createElement("span");
    dateNum.className = "day-date-num mono";
    dateNum.textContent = `${String(day).padStart(2, "0")}/${String(state.month).padStart(2, "0")}`;

    const weekdaySpan = document.createElement("span");
    weekdaySpan.className = "day-weekday";
    weekdaySpan.textContent = `יום ${HEBREW_WEEKDAYS[weekdayIdx]}`;

    dateCell.append(dateNum, weekdaySpan);

    if (isToday) {
      dateCell.appendChild(createBadge("היום", "badge-today"));
    }
    if (holidayInfo?.isOfficialHoliday) {
      dateCell.appendChild(createBadge(holidayInfo.title, "badge-holiday"));
    } else if (isShabbat) {
      dateCell.appendChild(createBadge("שבת", "badge-shabbat"));
    }
    if (entry.status === "vacation") {
      dateCell.appendChild(createBadge("חופשה", "badge-status-vacation"));
    } else if (entry.status === "sick") {
      dateCell.appendChild(createBadge(`מחלה ${dayRes.sickPercent}%`, "badge-status-sick"));
    }

    // שדות כניסה ויציאה + כפתורי תבניות משמרת בלחיצה אחת
    const inputsCell = document.createElement("div");
    inputsCell.className = "day-inputs-cell";

    const pairWrap = document.createElement("div");
    pairWrap.className = "time-inputs-pair";

    const inWrap = createTimeInputWrap({
      label: "כניסה",
      value: entry.checkIn || "",
      dateStr,
      field: "checkIn",
      disabled: isNonWorkStatus,
      placeholder: "07:00"
    });

    const outWrap = createTimeInputWrap({
      label: "יציאה",
      value: entry.checkOut || "",
      dateStr,
      field: "checkOut",
      disabled: isNonWorkStatus,
      placeholder: "16:00"
    });

    pairWrap.append(inWrap, outWrap);

    const quickFillBar = document.createElement("div");
    quickFillBar.className = "quick-fill-bar";
    quickFillBar.setAttribute("aria-label", `תבניות משמרת מהירות ליום ${dateStr}`);

    for (const tpl of SHIFT_TEMPLATES) {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive =
        !isNonWorkStatus && entry.checkIn === tpl.checkIn && entry.checkOut === tpl.checkOut;
      btn.className = `quick-fill-btn${isActive ? " is-active" : ""}`;
      btn.disabled = isNonWorkStatus;
      btn.title = `${tpl.label}: ${tpl.checkIn}–${tpl.checkOut}`;
      btn.textContent = `${tpl.label} ${tpl.shortLabel}`;
      btn.addEventListener("click", () => applyShiftTemplate(dateStr, tpl));
      quickFillBar.appendChild(btn);
    }

    inputsCell.append(pairWrap, quickFillBar);

    // תא שעות וסוג משמרת
    const metaCell = document.createElement("div");
    metaCell.className = "day-meta-cell";

    if (dayRes.totalHours > 0 || isNonWorkStatus) {
      const hrsSpan = document.createElement("span");
      hrsSpan.className = "hours-pill mono";
      hrsSpan.textContent = `${formatHours(dayRes.totalHours)} ש'`;
      metaCell.appendChild(hrsSpan);

      if (dayRes.shiftLabel) {
        const tag = document.createElement("span");
        tag.className = "shift-tag";
        tag.textContent = dayRes.shiftLabel;
        metaCell.appendChild(tag);
      }

      if (dayRes.exceedsMaxHours) {
        metaCell.appendChild(createBadge("חריגה מ-12 ש'", "badge-warning"));
      }
    } else {
      const rateSpan = document.createElement("span");
      rateSpan.className = "field-hint mono";
      rateSpan.textContent = `${dayRes.hourlyRate} ₪/ש'`;
      metaCell.appendChild(rateSpan);
    }

    if (entry.overrideRate !== undefined && entry.overrideRate !== null && entry.overrideRate !== "") {
      metaCell.appendChild(createBadge(`${entry.overrideRate} ₪`, "badge-override mono"));
    }

    // שכר ברוטו יומי (ללא נסיעות וללא תן ביס)
    const grossCell = document.createElement("div");
    grossCell.className = `day-gross-cell mono${dayRes.dailyGross <= 0 ? " is-empty" : ""}`;
    grossCell.textContent = dayRes.dailyGross > 0 ? `${formatCurrency(dayRes.dailyGross)} ₪` : "—";

    // כפתור גלגל שיניים יומי
    const gearCell = document.createElement("div");
    gearCell.className = "day-gear-cell";
    const gearBtn = document.createElement("button");
    gearBtn.type = "button";
    gearBtn.className = `gear-btn${hasCustomOverride ? " has-override" : ""}`;
    gearBtn.setAttribute("aria-label", `הגדרות ליום ${dateStr}`);
    gearBtn.title = "הגדרות יום (חופש, מחלה, תעריף מותאם)";
    gearBtn.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    `;
    gearBtn.addEventListener("click", () => openDaySettingsModal(dateStr));
    gearCell.appendChild(gearBtn);

    row.append(dateCell, inputsCell, metaCell, grossCell, gearCell);
    fragment.appendChild(row);
  }

  els.daysList.innerHTML = "";
  els.daysList.appendChild(fragment);

  if (activeKey) {
    const restored = els.daysList.querySelector(`[data-focus-key="${activeKey}"]`);
    if (restored && !restored.disabled) {
      restored.focus({ preventScroll: true });
    }
  }
}

function applyShiftTemplate(dateStr, template) {
  const existing = { ...(state.daysData[dateStr] || {}) };
  const isSameTemplate =
    (!existing.status || existing.status === "work") &&
    existing.checkIn === template.checkIn &&
    existing.checkOut === template.checkOut;

  if (isSameTemplate) {
    // לחיצה חוזרת על המשמרת שנבחרה מבטלת אותה ומחזירה את השעות לריקות
    delete existing.checkIn;
    delete existing.checkOut;
    if (isEntryEmpty(existing)) {
      delete state.daysData[dateStr];
    } else {
      state.daysData[dateStr] = existing;
    }
  } else {
    existing.status = "work";
    existing.checkIn = template.checkIn;
    existing.checkOut = template.checkOut;
    state.daysData[dateStr] = existing;
  }

  renderMonthUI();
  saveMonthNow();
}

function createBadge(text, className) {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

// ============================================================================
// Time Input Formatting & Auto-Advance Focus
// ============================================================================
function createTimeInputWrap({ label, value, dateStr, field, disabled, placeholder }) {
  const wrap = document.createElement("div");
  wrap.className = "time-field-wrap";

  const lbl = document.createElement("span");
  lbl.className = "time-field-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "time-input";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = 5;
  input.placeholder = placeholder;
  input.value = value;
  input.disabled = disabled;
  input.dataset.date = dateStr;
  input.dataset.field = field;
  input.dataset.focusKey = `${dateStr}_${field}`;
  input.setAttribute("aria-label", `${label} לתאריך ${dateStr}`);

  input.addEventListener("input", (e) => handleTimeInput(e.target));
  input.addEventListener("blur", (e) => handleTimeBlur(e.target));

  wrap.append(lbl, input);
  return wrap;
}

function handleTimeInput(input) {
  const rawDigits = input.value.replace(/\D/g, "").slice(0, 4);

  if (rawDigits.length === 0) {
    input.value = "";
    input.classList.remove("invalid");
    updateDayTimeValue(input.dataset.date, input.dataset.field, "");
    return;
  }

  if (rawDigits.length <= 2) {
    input.value = rawDigits;
    input.classList.remove("invalid");
    return;
  }

  const formatted = `${rawDigits.slice(0, 2)}:${rawDigits.slice(2)}`;
  input.value = formatted;

  if (rawDigits.length === 4) {
    const hh = Number(rawDigits.slice(0, 2));
    const mm = Number(rawDigits.slice(2, 4));
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      input.classList.remove("invalid");
      const currentDate = input.dataset.date;
      const currentField = input.dataset.field;
      const nextFocusKey = getNextFocusKey(currentDate, currentField);

      updateDayTimeValue(currentDate, currentField, formatted);

      // קפיצת פוקוס אוטומטית (Auto-Advance) + גלילה עדינה לשורה הבאה
      if (nextFocusKey) {
        requestAnimationFrame(() => {
          const nextEl = els.daysList.querySelector(`[data-focus-key="${nextFocusKey}"]`);
          if (nextEl && !nextEl.disabled) {
            nextEl.focus();
            if (currentField === "checkOut") {
              nextEl.closest(".day-row")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }
        });
      }
    } else {
      input.classList.add("invalid");
    }
  }
}

function handleTimeBlur(input) {
  const digits = input.value.replace(/\D/g, "");
  if (digits.length === 0) {
    input.classList.remove("invalid");
    return;
  }

  if (digits.length === 3) {
    const hh = Number(digits.slice(0, 1));
    const mm = Number(digits.slice(1, 3));
    if (hh >= 0 && hh <= 9 && mm >= 0 && mm <= 59) {
      const formatted = `0${hh}:${String(mm).padStart(2, "0")}`;
      input.value = formatted;
      input.classList.remove("invalid");
      updateDayTimeValue(input.dataset.date, input.dataset.field, formatted);
      return;
    }
  }

  if (!/^\d{2}:\d{2}$/.test(input.value)) {
    input.classList.add("invalid");
  }
}

function getNextFocusKey(dateStr, field) {
  if (field === "checkIn") {
    return `${dateStr}_checkOut`;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let nextDay = d + 1; nextDay <= daysInMonth; nextDay++) {
    const nextDateStr = `${y}-${String(m).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
    const nextEntry = state.daysData[nextDateStr] || {};
    if (nextEntry.status !== "vacation" && nextEntry.status !== "sick") {
      return `${nextDateStr}_checkIn`;
    }
  }
  return null;
}

function updateDayTimeValue(dateStr, field, value) {
  const existing = { ...(state.daysData[dateStr] || {}) };
  if (value) {
    existing[field] = value;
  } else {
    delete existing[field];
  }

  if (isEntryEmpty(existing)) {
    delete state.daysData[dateStr];
  } else {
    state.daysData[dateStr] = existing;
  }

  renderMonthUI();
  scheduleMonthSave();
}

function isEntryEmpty(entry) {
  return (
    !entry.checkIn &&
    !entry.checkOut &&
    (!entry.status || entry.status === "work") &&
    (!entry.overrideShiftType || entry.overrideShiftType === "auto") &&
    (entry.overrideRate === undefined || entry.overrideRate === null || entry.overrideRate === "") &&
    (entry.sickDayNumberOverride === undefined || entry.sickDayNumberOverride === "")
  );
}

// ============================================================================
// Auto-Scroll to Today
// ============================================================================
function getTodayDateStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function scrollToTodayIfCurrentMonth() {
  if (state.hasScrolledToTodayOnce) return;
  state.hasScrolledToTodayOnce = true;
  scrollToToday(false);
}

function scrollToToday(showNoticeIfMissing = false) {
  const todayStr = getTodayDateStr();
  const row = els.daysList.querySelector(`.day-row[data-date="${todayStr}"]`);
  if (row) {
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  } else if (showNoticeIfMissing) {
    showToast("התאריך של היום אינו בחודש זה", "error");
  }
}

// ============================================================================
// Daily Settings Modal (Gear Icon)
// ============================================================================
function openDaySettingsModal(dateStr) {
  state.editingDateStr = dateStr;
  const entry = state.daysData[dateStr] || {};
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = HEBREW_WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const defaultRate = getHourlyRateForDate(dateStr, state.settings);

  els.dayModalTitle.textContent = `הגדרות ליום ${weekday}`;
  els.dayModalSubtitle.textContent = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

  els.dayStatusSelect.value = entry.status || "work";
  els.daySickOverrideSelect.value =
    entry.sickDayNumberOverride !== undefined && entry.sickDayNumberOverride !== null
      ? String(entry.sickDayNumberOverride)
      : "";
  els.dayShiftTypeSelect.value = entry.overrideShiftType || "auto";
  els.dayOverrideRateInput.value =
    entry.overrideRate !== undefined && entry.overrideRate !== null ? String(entry.overrideRate) : "";
  els.dayDefaultRateHint.textContent = `תעריף אוטומטי לתאריך זה לפי הסכם LTS: ${defaultRate} ש"ח לשעה`;

  updateDayModalVisibility();
  els.dayModal.hidden = false;
}

function updateDayModalVisibility() {
  const status = els.dayStatusSelect.value;
  els.sickOverrideGroup.hidden = status !== "sick";
  els.shiftTypeGroup.hidden = status !== "work";
}

function handleDaySettingsSave(e) {
  e.preventDefault();
  const dateStr = state.editingDateStr;
  if (!dateStr) return;

  const existing = { ...(state.daysData[dateStr] || {}) };
  const status = els.dayStatusSelect.value;
  existing.status = status;

  if (status === "sick") {
    existing.sickDayNumberOverride = els.daySickOverrideSelect.value
      ? Number(els.daySickOverrideSelect.value)
      : "";
    delete existing.checkIn;
    delete existing.checkOut;
  } else if (status === "vacation") {
    delete existing.sickDayNumberOverride;
    delete existing.checkIn;
    delete existing.checkOut;
  } else {
    delete existing.sickDayNumberOverride;
    existing.overrideShiftType = els.dayShiftTypeSelect.value;
  }

  const rateVal = els.dayOverrideRateInput.value.trim();
  if (rateVal !== "" && !Number.isNaN(Number(rateVal))) {
    existing.overrideRate = Number(rateVal);
  } else {
    delete existing.overrideRate;
  }

  if (isEntryEmpty(existing)) {
    delete state.daysData[dateStr];
  } else {
    state.daysData[dateStr] = existing;
  }

  closeModal("dayModal");
  renderMonthUI();
  saveMonthNow();
  showToast("הגדרות היום נשמרו", "success");
}

function handleClearDay() {
  const dateStr = state.editingDateStr;
  if (!dateStr) return;
  delete state.daysData[dateStr];
  state.editingDateStr = null;
  closeModal("dayModal");
  renderMonthUI();
  saveMonthNow();
  showToast("נתוני היום נוקו", "success");
}

// ============================================================================
// Global Settings Modal
// ============================================================================
function openGlobalSettingsModal() {
  const s = state.settings;
  els.cfgStandardHours.value = String(s.standardDailyHours);
  els.cfgShortenedHours.value = String(s.shortenedDailyHours);
  els.cfgShortenedWeekday.value = String(s.shortenedWeekday);
  els.cfgNightHours.value = String(s.nightStandardHours);
  els.cfgShabbatPercent.value = String(s.shabbatHolidayRatePercent);

  els.cfgStartDate.value = s.employmentStartDate || "2026-11-15";
  els.cfgVacAccrual.value = String(s.vacationMonthlyAccrual ?? 1.0);
  els.cfgSickAccrual.value = String(s.sickMonthlyAccrual ?? 1.5);
  els.cfgVacOpening.value = String(s.vacationOpeningBalance ?? 0);
  els.cfgSickOpening.value = String(s.sickOpeningBalance ?? 0);

  els.cfgTravel.value = String(s.travelAllowance);
  els.cfgTenBis.value = String(s.tenBisValue);
  els.cfgHealthImputed.value = String(s.healthInsuranceImputed);

  els.cfgCreditPoints.value = String(s.creditPoints);
  els.cfgCreditPointValue.value = String(s.creditPointValue);
  els.cfgPensionPercent.value = String(s.pensionEmployeePercent);

  els.wageTiersContainer.innerHTML = "";
  (s.wageTiers || []).forEach((tier) => addWageTierRow(tier));

  els.taxBracketsContainer.innerHTML = "";
  (s.taxBrackets || []).forEach((bracket, idx) => {
    const row = document.createElement("div");
    row.className = "bracket-row";
    const isLast = bracket.upTo === Infinity || bracket.upTo === null;
    row.innerHTML = `
      <input
        type="${isLast ? "text" : "number"}"
        class="form-control mono bracket-upto"
        value="${isLast ? "ומעלה" : bracket.upTo}"
        ${isLast ? "disabled" : 'min="0" step="10" required'}
        aria-label="תקרת מדרגת מס ${idx + 1}"
      />
      <input
        type="number"
        class="form-control mono bracket-rate"
        value="${Math.round(bracket.rate * 100)}"
        min="0"
        max="65"
        step="1"
        required
        aria-label="אחוז מס במדרגה ${idx + 1}"
      />
    `;
    els.taxBracketsContainer.appendChild(row);
  });

  els.globalModal.hidden = false;
}

function addWageTierRow(tier) {
  const row = document.createElement("div");
  row.className = "dynamic-row";
  row.innerHTML = `
    <input
      type="date"
      class="form-control mono tier-date"
      value="${tier.effectiveFrom || ""}"
      required
      aria-label="תאריך תחילת מדרגה"
    />
    <input
      type="number"
      class="form-control mono tier-rate"
      value="${tier.rate ?? ""}"
      step="0.5"
      min="1"
      required
      placeholder="ש״ח"
      aria-label="שכר שעתי בשקלים"
    />
    <button type="button" class="icon-btn remove-tier-btn" aria-label="מחק מדרגה" title="מחק מדרגה">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  row.querySelector(".remove-tier-btn").addEventListener("click", () => {
    if (els.wageTiersContainer.children.length > 1) {
      row.remove();
    }
  });
  els.wageTiersContainer.appendChild(row);
}

async function handleGlobalSettingsSave(e) {
  e.preventDefault();

  const wageTiers = Array.from(els.wageTiersContainer.querySelectorAll(".dynamic-row"))
    .map((row) => ({
      effectiveFrom: row.querySelector(".tier-date").value,
      rate: Number(row.querySelector(".tier-rate").value),
      label: ""
    }))
    .filter((t) => t.effectiveFrom && t.rate > 0)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const taxBrackets = Array.from(els.taxBracketsContainer.querySelectorAll(".bracket-row")).map((row) => {
    const upToInput = row.querySelector(".bracket-upto");
    const rateInput = row.querySelector(".bracket-rate");
    return {
      upTo: upToInput.disabled ? Infinity : Number(upToInput.value),
      rate: Number(rateInput.value) / 100
    };
  });

  state.settings = mergeSettings({
    ...state.settings,
    standardDailyHours: Number(els.cfgStandardHours.value),
    shortenedDailyHours: Number(els.cfgShortenedHours.value),
    shortenedWeekday: Number(els.cfgShortenedWeekday.value),
    nightStandardHours: Number(els.cfgNightHours.value),
    shabbatHolidayRatePercent: Number(els.cfgShabbatPercent.value),
    employmentStartDate: els.cfgStartDate.value || "2026-11-15",
    vacationMonthlyAccrual: Number(els.cfgVacAccrual.value),
    sickMonthlyAccrual: Number(els.cfgSickAccrual.value),
    vacationOpeningBalance: Number(els.cfgVacOpening.value),
    sickOpeningBalance: Number(els.cfgSickOpening.value),
    travelAllowance: Number(els.cfgTravel.value),
    tenBisValue: Number(els.cfgTenBis.value),
    healthInsuranceImputed: Number(els.cfgHealthImputed.value),
    creditPoints: Number(els.cfgCreditPoints.value),
    creditPointValue: Number(els.cfgCreditPointValue.value),
    pensionEmployeePercent: Number(els.cfgPensionPercent.value),
    wageTiers,
    taxBrackets
  });

  closeModal("globalModal");
  renderMonthUI();
  await persistSettingsToCloud(state.settings);
  showToast("ההגדרות הגלובליות נשמרו", "success");
}

async function handleResetDefaultSettings() {
  state.settings = mergeSettings(DEFAULT_SETTINGS);
  closeModal("globalModal");
  renderMonthUI();
  await persistSettingsToCloud(state.settings);
  showToast("ההגדרות אופסו לברירת המחדל של הסכם LTS", "success");
}

// ============================================================================
// Excel Import (SheetJS)
// ============================================================================
async function handleExcelImport(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  if (typeof window.XLSX === "undefined") {
    showToast("ספריית SheetJS לא נטענה. בדוק חיבור לאינטרנט.", "error");
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

    if (!rows.length) {
      showToast("הקובץ ריק או ללא שורות נתונים", "error");
      return;
    }

    const groupedByMonth = {};
    let importedCount = 0;

    for (const row of rows) {
      const dateRaw = findCellByHeader(row, ["תאריך", "date"]);
      const inRaw = findCellByHeader(row, ["שעת כניסה", "כניסה", "in", "check in", "start"]);
      const outRaw = findCellByHeader(row, ["שעת יציאה", "יציאה", "out", "check out", "end"]);

      const dateStr = parseExcelDateToISO(dateRaw);
      if (!dateStr) continue;

      const checkIn = parseExcelTimeToHHMM(inRaw);
      const checkOut = parseExcelTimeToHHMM(outRaw);
      if (!checkIn && !checkOut) continue;

      const monthKey = dateStr.slice(0, 7);
      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = {};
      }
      groupedByMonth[monthKey][dateStr] = {
        checkIn: checkIn || "",
        checkOut: checkOut || "",
        status: "work"
      };
      importedCount += 1;
    }

    if (importedCount === 0) {
      showToast("לא נמצאו שורות תקינות עם עמודות תאריך, שעת כניסה ושעת יציאה", "error");
      return;
    }

    const monthKeys = Object.keys(groupedByMonth).sort();
    for (const mKey of monthKeys) {
      const [y, m] = mKey.split("-").map(Number);
      const existing =
        y === state.year && m === state.month ? { ...state.daysData } : loadLocalMonth(y, m);

      for (const [dStr, importedEntry] of Object.entries(groupedByMonth[mKey])) {
        existing[dStr] = {
          ...(existing[dStr] || {}),
          ...importedEntry
        };
      }

      saveLocalMonth(y, m, existing);
      state.allMonthsMap[mKey] = existing;
      if (y === state.year && m === state.month) {
        state.daysData = existing;
      }
      await persistMonthToCloud(y, m, existing);
    }

    const targetMonthKey = monthKeys[monthKeys.length - 1];
    const [targetY, targetM] = targetMonthKey.split("-").map(Number);
    if (targetY !== state.year || targetM !== state.month) {
      await setMonthYear(targetY, targetM);
    } else {
      renderMonthUI();
    }

    showToast(`יובאו ${importedCount} משמרות בהצלחה וסונכרנו לענן`, "success");
  } catch (err) {
    console.error("Excel import error:", err);
    showToast("שגיאה בקריאת קובץ האקסל. ודא שהקובץ תקין.", "error");
  }
}

function findCellByHeader(row, candidates) {
  const keys = Object.keys(row);
  for (const key of keys) {
    const clean = key.trim().toLowerCase();
    if (candidates.some((c) => clean === c || clean.includes(c))) {
      return row[key];
    }
  }
  return "";
}

function parseExcelDateToISO(val) {
  if (val === null || val === undefined || val === "") return null;

  if (typeof val === "number" && val > 20000 && val < 90000) {
    const parsed = window.XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
  }

  const str = String(val).trim();
  let m = str.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  m = str.match(/^(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function parseExcelTimeToHHMM(val) {
  if (val === null || val === undefined || val === "") return "";

  if (typeof val === "number" && val >= 0 && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${String(val.getHours()).padStart(2, "0")}:${String(val.getMinutes()).padStart(2, "0")}`;
  }

  const str = String(val).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  return "";
}

// ============================================================================
// LocalStorage & Utilities
// ============================================================================
function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(LS_KEYS.SETTINGS);
    if (!raw) return mergeSettings(DEFAULT_SETTINGS);
    return mergeSettings(JSON.parse(raw));
  } catch {
    return mergeSettings(DEFAULT_SETTINGS);
  }
}

function saveLocalSettings(settings) {
  const serializable = {
    ...settings,
    taxBrackets: settings.taxBrackets.map((b) => ({
      upTo: b.upTo === Infinity ? null : b.upTo,
      rate: b.rate
    }))
  };
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(serializable));
}

function loadLocalMonth(year, month) {
  try {
    const raw = localStorage.getItem(`${LS_KEYS.MONTH_PREFIX}${getMonthKey(year, month)}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadAllLocalMonths() {
  const map = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_KEYS.MONTH_PREFIX)) {
      const monthKey = key.slice(LS_KEYS.MONTH_PREFIX.length);
      try {
        map[monthKey] = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        // התעלמות מרשומה פגומה
      }
    }
  }
  return map;
}

function saveLocalMonth(year, month, data) {
  localStorage.setItem(`${LS_KEYS.MONTH_PREFIX}${getMonthKey(year, month)}`, JSON.stringify(data));
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3400);
}

// הפעלת האפליקציה
init();
