/**
 * salaryCalculator.js
 * מנוע חישוב שעות עבודה, משמרות בוקר/ערב, שעות נוספות, ימי חופשה/מחלה,
 * יתרות צבורות של חופשה ומחלה, זקיפות שווי ומיסוי ישראלי עבור אנה מירושניצ'נקו (LTS).
 */

export const DEFAULT_SETTINGS = {
  employeeName: "אנה מירושניצ'נקו",
  companyName: 'אל.טי.אס טכנולוגיות מכשירים בע"מ (LTS)',
  employmentStartDate: "2026-11-15",

  // מדרגות שכר שעתי לפי תאריך (סעיף 10 להסכם)
  wageTiers: [
    { effectiveFrom: "2026-11-15", rate: 46, label: "תחילת העסקה (15/11/2026)" },
    { effectiveFrom: "2027-01-01", rate: 53, label: "עדכון ינואר 2027 (01/01/2027)" },
    { effectiveFrom: "2027-05-15", rate: 54, label: "ותק 6 חודשים (15/05/2027)" },
    { effectiveFrom: "2027-11-15", rate: 55, label: "ותק 12 חודשים (15/11/2027)" }
  ],

  // תקן שבוע עבודה של 42 שעות
  standardDailyHours: 8.4,     // ברירת מחדל: 8.4 שעות (ניתן לשנות ל-8.6)
  shortenedDailyHours: 7.4,    // ברירת מחדל: 7.4 שעות (ניתן לשנות ל-7.6)
  shortenedWeekday: 4,         // 4 = יום חמישי (0=ראשון ... 6=שבת), -1 = ללא יום מקוצר קבוע
  nightStandardHours: 7.0,     // תקן משמרת לילה/ערב לפי חוק (7 שעות רגילות + 2 נוספות 125%)
  maxDailyHoursWarning: 12.0,  // התרעת חריגה מ-12 שעות עבודה ביום (סעיף 11)

  // צבירת ימי חופשה ומחלה (חוק חופשה שנתית וחוק דמי מחלה בישראל)
  vacationMonthlyAccrual: 1.0, // 12 ימי חופשה בשנה בשבוע עבודה של 5 ימים (שנים 1–4)
  sickMonthlyAccrual: 1.5,     // 1.5 ימי מחלה בחודש (18 בשנה)
  sickMaxAccrualCap: 90,       // תקרת צבירה בחוק: 90 ימי מחלה
  vacationOpeningBalance: 0,   // יתרת פתיחה ידנית (אם רלוונטי)
  sickOpeningBalance: 0,       // יתרת פתיחה ידנית (אם רלוונטי)

  // תעריפי שבת וחג
  shabbatHolidayRatePercent: 150, // תעריף שעות תקן בשבת/חג (150%)

  // תוספות וזקיפות שווי (סעיפים 12, 16, 18)
  travelAllowance: 315,        // דמי נסיעות חודשיים קבועים (ברוטו, לא לפנסיה)
  tenBisValue: 750,            // זקיפת שווי תן ביס למס בלבד (לא נכנס לנטו במזומן)
  healthInsuranceImputed: 0,   // זקיפת שווי ביטוח בריאות קבוצתי למס (סעיף 18)

  // פנסיה (סעיף 17)
  pensionEmployeePercent: 6.0, // הפרשת עובד 6% מהשכר הקובע
  pensionTaxCreditRate: 0.35,  // זיכוי מס הכנסה 35% בגין הפקדת עובד לקצבה
  pensionCreditSalaryCap: 9700,// תקרת הכנסה מזכה חודשית לחישוב זיכוי מס (סעיף 45א)

  // מס הכנסה (ישראל - פרופיל אישה)
  creditPoints: 2.75,          // 2.25 תושבת ישראל + 0.5 לאישה
  creditPointValue: 242,       // שווי נקודת זיכוי חודשית בש"ח
  taxBrackets: [
    { upTo: 7010, rate: 0.10 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 16150, rate: 0.20 },
    { upTo: 22440, rate: 0.31 },
    { upTo: 46690, rate: 0.35 },
    { upTo: 60130, rate: 0.47 },
    { upTo: Infinity, rate: 0.50 }
  ],

  // ביטוח לאומי ומס בריאות (מדרגות שכיר)
  niReducedThreshold: 7522,
  niMaxSalaryCap: 49030,
  niReducedRate: 0.004,        // 0.4%
  healthReducedRate: 0.031,    // 3.1%
  niFullRate: 0.07,            // 7.0%
  healthFullRate: 0.05         // 5.0%
};

/**
 * תבניות משמרת בלחיצה אחת (Quick Fill)
 */
export const SHIFT_TEMPLATES = [
  { id: "morning", label: "בוקר", shortLabel: "07–16", checkIn: "07:00", checkOut: "16:00" },
  { id: "early", label: "מוקדם", shortLabel: "05–16", checkIn: "05:00", checkOut: "16:00" },
  { id: "evening", label: "ערב", shortLabel: "16–01", checkIn: "16:00", checkOut: "01:00" }
];

/**
 * מחזיר עותק עמוק של הגדרות ברירת המחדל ממוזג עם הגדרות שמורות
 */
export function mergeSettings(savedSettings = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...savedSettings
  };

  if (Array.isArray(savedSettings?.wageTiers) && savedSettings.wageTiers.length > 0) {
    merged.wageTiers = savedSettings.wageTiers.map((t) => ({
      effectiveFrom: String(t.effectiveFrom || "2026-11-15"),
      rate: Number(t.rate) || 46,
      label: String(t.label || "")
    }));
  } else {
    merged.wageTiers = DEFAULT_SETTINGS.wageTiers.map((t) => ({ ...t }));
  }

  if (Array.isArray(savedSettings?.taxBrackets) && savedSettings.taxBrackets.length > 0) {
    merged.taxBrackets = savedSettings.taxBrackets.map((b) => ({
      upTo: b.upTo === null || b.upTo === "Infinity" || b.upTo === Infinity ? Infinity : Number(b.upTo),
      rate: Number(b.rate)
    }));
  } else {
    merged.taxBrackets = DEFAULT_SETTINGS.taxBrackets.map((b) => ({ ...b }));
  }

  return merged;
}

/**
 * המרת מחרוזת שעה "HH:MM" לדקות מחצות (0-1439)
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * חישוב משך משמרת בדקות כולל תמיכה בחציית חצות (למשל 16:00 עד 01:00)
 */
export function calculateShiftDurationMinutes(checkIn, checkOut) {
  const start = parseTimeToMinutes(checkIn);
  const end = parseTimeToMinutes(checkOut);
  if (start === null || end === null) return 0;

  let diff = end - start;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  return diff;
}

/**
 * בדיקה האם המשמרת נחשבת "משמרת ערב / לילה" לפי הסכם LTS וחוק שעות עבודה ומנוחה:
 * - שעת התחלה 14:00 ואילך (כולל 16:00-01:00), או
 * - לפחות שעתיים (120 דקות) מתוך המשמרת נופלות בין 22:00 ל-06:00
 */
export function isEveningNightShift(checkIn, checkOut) {
  const start = parseTimeToMinutes(checkIn);
  const endRaw = parseTimeToMinutes(checkOut);
  if (start === null || endRaw === null) return false;

  if (start >= 14 * 60) {
    return true;
  }

  const duration = calculateShiftDurationMinutes(checkIn, checkOut);
  const end = start + duration;

  const nightWindows = [
    [0, 6 * 60],
    [22 * 60, 30 * 60],
    [46 * 60, 54 * 60]
  ];

  let nightMinutes = 0;
  for (const [winStart, winEnd] of nightWindows) {
    const overlapStart = Math.max(start, winStart);
    const overlapEnd = Math.min(end, winEnd);
    if (overlapEnd > overlapStart) {
      nightMinutes += overlapEnd - overlapStart;
    }
  }

  return nightMinutes >= 120;
}

/**
 * שליפת השכר השעתי של אנה לפי תאריך המשמרת (YYYY-MM-DD)
 */
export function getHourlyRateForDate(dateStr, settings = DEFAULT_SETTINGS) {
  const tiers = [...(settings.wageTiers || DEFAULT_SETTINGS.wageTiers)].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  );

  if (tiers.length === 0) return 46;

  let activeRate = tiers[0].rate;
  for (const tier of tiers) {
    if (dateStr >= tier.effectiveFrom) {
      activeRate = Number(tier.rate);
    }
  }
  return activeRate;
}

/**
 * קביעת יום בשבוע (0=ראשון ... 6=שבת) עבור מחרוזת YYYY-MM-DD ללא סטיות אזור זמן
 */
export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * חישוב שכר יומי עבור יום בודד
 */
export function calculateDaySalary({
  dateStr,
  entry = {},
  settings = DEFAULT_SETTINGS,
  isHoliday = false,
  sickSequenceIndex = 0
}) {
  const dayOfWeek = getDayOfWeek(dateStr);
  const isShabbat = dayOfWeek === 6;
  const isSpecialDay = isShabbat || isHoliday;

  const baseHourlyRate =
    entry.overrideRate !== undefined && entry.overrideRate !== null && entry.overrideRate !== ""
      ? Number(entry.overrideRate)
      : getHourlyRateForDate(dateStr, settings);

  const status = entry.status || "work";
  const overrideShift = entry.overrideShiftType || "auto";

  const isShortenedDay =
    overrideShift === "shortened" ||
    (overrideShift === "auto" &&
      Number(settings.shortenedWeekday) >= 0 &&
      dayOfWeek === Number(settings.shortenedWeekday));

  const standardDayHours = isShortenedDay
    ? Number(settings.shortenedDailyHours)
    : Number(settings.standardDailyHours);

  const result = {
    dateStr,
    status,
    hourlyRate: baseHourlyRate,
    totalHours: 0,
    regularHours: 0,
    ot125Hours: 0,
    ot150Hours: 0,
    ot175Hours: 0,
    ot200Hours: 0,
    regularPay: 0,
    overtimePay: 0,
    dailyGross: 0,
    pensionablePay: 0,
    shiftLabel: "",
    exceedsMaxHours: false,
    sickPercent: 0
  };

  // מקרה 1: יום חופש (סעיף 13)
  if (status === "vacation") {
    const pay = round2(standardDayHours * baseHourlyRate);
    result.totalHours = standardDayHours;
    result.regularHours = standardDayHours;
    result.regularPay = pay;
    result.dailyGross = pay;
    result.pensionablePay = pay;
    result.shiftLabel = "חופשה";
    return result;
  }

  // מקרה 2: יום מחלה (סעיף 14)
  if (status === "sick") {
    const effectiveSeq =
      entry.sickDayNumberOverride !== undefined &&
      entry.sickDayNumberOverride !== null &&
      entry.sickDayNumberOverride !== ""
        ? Number(entry.sickDayNumberOverride)
        : sickSequenceIndex;

    let pct = 0;
    if (effectiveSeq <= 1) {
      pct = 0;
    } else if (effectiveSeq === 2 || effectiveSeq === 3) {
      pct = 0.5;
    } else {
      pct = 1.0;
    }

    const pay = round2(standardDayHours * baseHourlyRate * pct);
    result.totalHours = standardDayHours;
    result.regularHours = standardDayHours;
    result.regularPay = pay;
    result.dailyGross = pay;
    result.pensionablePay = pay;
    result.sickPercent = Math.round(pct * 100);
    result.shiftLabel = `מחלה (${result.sickPercent}%)`;
    return result;
  }

  // מקרה 3: עבודה בפועל
  const durationMinutes = calculateShiftDurationMinutes(entry.checkIn, entry.checkOut);
  if (durationMinutes <= 0) {
    return result;
  }

  const totalHours = durationMinutes / 60;
  result.totalHours = round2(totalHours);
  result.exceedsMaxHours = totalHours > Number(settings.maxDailyHoursWarning || 12);

  if (overrideShift === "force100" || overrideShift === "force125" || overrideShift === "force150") {
    const mult = overrideShift === "force100" ? 1.0 : overrideShift === "force125" ? 1.25 : 1.5;
    const pay = round2(totalHours * baseHourlyRate * mult);
    result.dailyGross = pay;
    if (mult === 1.0) {
      result.regularHours = round2(totalHours);
      result.regularPay = pay;
      result.pensionablePay = round2(Math.min(totalHours, standardDayHours) * baseHourlyRate);
      result.shiftLabel = "ידני 100%";
    } else if (mult === 1.25) {
      result.ot125Hours = round2(totalHours);
      result.overtimePay = pay;
      result.pensionablePay = 0;
      result.shiftLabel = "ידני 125%";
    } else {
      result.ot150Hours = round2(totalHours);
      result.overtimePay = pay;
      result.pensionablePay = 0;
      result.shiftLabel = "ידני 150%";
    }
    return result;
  }

  const applyShabbatHoliday =
    overrideShift === "shabbat" || (overrideShift === "auto" && isSpecialDay);

  if (applyShabbatHoliday) {
    const baseMult = Number(settings.shabbatHolidayRatePercent || 150) / 100;
    const eveningDetected = isEveningNightShift(entry.checkIn, entry.checkOut);
    const threshold = eveningDetected ? Number(settings.nightStandardHours || 7) : standardDayHours;

    const stdHrs = Math.min(totalHours, threshold);
    const ot1Hrs = Math.max(0, Math.min(totalHours - threshold, 2));
    const ot2Hrs = Math.max(0, totalHours - threshold - 2);

    const ot1Mult = baseMult + 0.25;
    const ot2Mult = baseMult + 0.5;

    const stdPay = stdHrs * baseHourlyRate * baseMult;
    const ot1Pay = ot1Hrs * baseHourlyRate * ot1Mult;
    const ot2Pay = ot2Hrs * baseHourlyRate * ot2Mult;

    result.ot150Hours = round2(stdHrs);
    result.ot175Hours = round2(ot1Hrs);
    result.ot200Hours = round2(ot2Hrs);
    result.regularPay = round2(stdPay);
    result.overtimePay = round2(ot1Pay + ot2Pay);
    result.dailyGross = round2(stdPay + ot1Pay + ot2Pay);
    result.pensionablePay = round2(stdHrs * baseHourlyRate);
    result.shiftLabel = isHoliday ? "חג" : "שבת";
    return result;
  }

  const isEvening =
    overrideShift === "evening" ||
    (overrideShift === "auto" && isEveningNightShift(entry.checkIn, entry.checkOut));

  const dailyThreshold = isEvening
    ? Number(settings.nightStandardHours || 7.0)
    : standardDayHours;

  const regHrs = Math.min(totalHours, dailyThreshold);
  const ot125Hrs = Math.max(0, Math.min(totalHours - dailyThreshold, 2));
  const ot150Hrs = Math.max(0, totalHours - dailyThreshold - 2);

  const regPay = regHrs * baseHourlyRate;
  const ot125Pay = ot125Hrs * baseHourlyRate * 1.25;
  const ot150Pay = ot150Hrs * baseHourlyRate * 1.5;

  result.regularHours = round2(regHrs);
  result.ot125Hours = round2(ot125Hrs);
  result.ot150Hours = round2(ot150Hrs);
  result.regularPay = round2(regPay);
  result.overtimePay = round2(ot125Pay + ot150Pay);
  result.dailyGross = round2(regPay + ot125Pay + ot150Pay);
  result.pensionablePay = round2(regPay);
  result.shiftLabel = isEvening ? "ערב" : isShortenedDay ? "בוקר (מקוצר)" : "בוקר";

  return result;
}

/**
 * חישוב יתרות צבורות של ימי חופשה ומחלה מתחילת ההעסקה ועד סוף החודש הנבחר
 * @param {number} asOfYear
 * @param {number} asOfMonth - 1..12
 * @param {Object} allMonthsDaysMap - מפה של "YYYY-MM" -> { "YYYY-MM-DD": entry }
 * @param {Object} rawSettings
 */
export function calculateLeaveBalances(asOfYear, asOfMonth, allMonthsDaysMap = {}, rawSettings = DEFAULT_SETTINGS) {
  const settings = mergeSettings(rawSettings);
  const startStr = settings.employmentStartDate || "2026-11-15";
  const [startY, startM, startD] = startStr.split("-").map(Number);

  const asOfEndDateStr = `${asOfYear}-${String(asOfMonth).padStart(2, "0")}-${String(
    new Date(asOfYear, asOfMonth, 0).getDate()
  ).padStart(2, "0")}`;

  // חישוב חודשי ותק שנצברו (חודש התחלה חלקי מחושב יחסית לפי מספר הימים שנותרו בו)
  let accruedMonths = 0;
  if (asOfYear > startY || (asOfYear === startY && asOfMonth >= startM)) {
    const startMonthDays = new Date(startY, startM, 0).getDate();
    const firstMonthFraction = (startMonthDays - startD + 1) / startMonthDays;
    const fullMonthsAfterStart = (asOfYear - startY) * 12 + (asOfMonth - startM);
    accruedMonths = firstMonthFraction + fullMonthsAfterStart;
  }

  const vacationAccrued = round2(
    Number(settings.vacationOpeningBalance || 0) +
      accruedMonths * Number(settings.vacationMonthlyAccrual ?? 1.0)
  );
  const rawSickAccrued =
    Number(settings.sickOpeningBalance || 0) +
    accruedMonths * Number(settings.sickMonthlyAccrual ?? 1.5);

  let vacationUsed = 0;
  let sickUsed = 0;

  for (const monthDays of Object.values(allMonthsDaysMap || {})) {
    if (!monthDays || typeof monthDays !== "object") continue;
    for (const [dateStr, entry] of Object.entries(monthDays)) {
      if (dateStr < startStr || dateStr > asOfEndDateStr) continue;
      if (entry?.status === "vacation") {
        vacationUsed += 1;
      } else if (entry?.status === "sick") {
        sickUsed += 1;
      }
    }
  }

  const sickCap = Number(settings.sickMaxAccrualCap || 90);
  const sickAccrued = round2(rawSickAccrued);
  const sickRemaining = round2(Math.min(sickCap, Math.max(0, sickAccrued - sickUsed)));
  const vacationRemaining = round2(vacationAccrued - vacationUsed);

  return {
    accruedMonths: round2(accruedMonths),
    vacation: {
      accrued: vacationAccrued,
      used: vacationUsed,
      remaining: vacationRemaining
    },
    sick: {
      accrued: sickAccrued,
      used: sickUsed,
      remaining: sickRemaining,
      cap: sickCap
    }
  };
}

/**
 * חישוב מס הכנסה גולמי לפי מדרגות מס חודשיות
 */
export function calculateGrossIncomeTax(taxableIncome, brackets = DEFAULT_SETTINGS.taxBrackets) {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const limit = bracket.upTo === null || bracket.upTo === "Infinity" ? Infinity : Number(bracket.upTo);
    const rate = Number(bracket.rate);
    if (taxableIncome <= prevLimit) break;

    const taxableInBracket = Math.min(taxableIncome, limit) - prevLimit;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * rate;
    }
    prevLimit = limit;
  }

  return round2(tax);
}

/**
 * חישוב ביטוח לאומי ומס בריאות (מדרגות שכיר)
 */
export function calculateNationalInsuranceAndHealth(taxableIncome, settings = DEFAULT_SETTINGS) {
  if (taxableIncome <= 0) {
    return { nationalInsurance: 0, healthTax: 0 };
  }

  const cappedIncome = Math.min(taxableIncome, Number(settings.niMaxSalaryCap || 49030));
  const threshold = Number(settings.niReducedThreshold || 7522);

  const reducedPart = Math.min(cappedIncome, threshold);
  const fullPart = Math.max(0, cappedIncome - threshold);

  const nationalInsurance =
    reducedPart * Number(settings.niReducedRate) + fullPart * Number(settings.niFullRate);
  const healthTax =
    reducedPart * Number(settings.healthReducedRate) + fullPart * Number(settings.healthFullRate);

  return {
    nationalInsurance: round2(nationalInsurance),
    healthTax: round2(healthTax)
  };
}

/**
 * חישוב סיכום חודשי מלא כולל רצף ימי מחלה, נסיעות, זקיפת תן ביס, פנסיה, מס הכנסה וביטוח לאומי
 */
export function calculateMonthSummary(year, month, daysData = {}, holidaysMap = {}, rawSettings = DEFAULT_SETTINGS) {
  const settings = mergeSettings(rawSettings);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailyResults = {};
  let totalHours = 0;
  let totalRegularHours = 0;
  let totalOt125Hours = 0;
  let totalOt150Hours = 0;
  let totalOt175Hours = 0;
  let totalOt200Hours = 0;
  let totalWorkGross = 0;
  let totalPensionableSalary = 0;
  let workedDaysCount = 0;
  let vacationDaysCount = 0;
  let sickDaysCount = 0;

  let consecutiveSickDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = daysData[dateStr] || {};
    const holidayInfo = holidaysMap[dateStr];
    const isHoliday = Boolean(holidayInfo?.isOfficialHoliday);

    if (entry.status === "sick") {
      consecutiveSickDays += 1;
    } else {
      consecutiveSickDays = 0;
    }

    const dayRes = calculateDaySalary({
      dateStr,
      entry,
      settings,
      isHoliday,
      sickSequenceIndex: consecutiveSickDays
    });

    dailyResults[dateStr] = dayRes;

    totalHours += dayRes.totalHours;
    totalRegularHours += dayRes.regularHours;
    totalOt125Hours += dayRes.ot125Hours;
    totalOt150Hours += dayRes.ot150Hours;
    totalOt175Hours += dayRes.ot175Hours;
    totalOt200Hours += dayRes.ot200Hours;
    totalWorkGross += dayRes.dailyGross;
    totalPensionableSalary += dayRes.pensionablePay;

    if (dayRes.status === "vacation") {
      vacationDaysCount += 1;
    } else if (dayRes.status === "sick") {
      sickDaysCount += 1;
    } else if (dayRes.totalHours > 0) {
      workedDaysCount += 1;
    }
  }

  totalWorkGross = round2(totalWorkGross);
  totalPensionableSalary = round2(totalPensionableSalary);

  const travelAllowance = Number(settings.travelAllowance || 0);
  const tenBisValue = Number(settings.tenBisValue || 0);
  const healthInsuranceImputed = Number(settings.healthInsuranceImputed || 0);

  const cashGross = round2(totalWorkGross + travelAllowance);
  const taxableGross = round2(cashGross + tenBisValue + healthInsuranceImputed);

  const pensionRate = Number(settings.pensionEmployeePercent || 6) / 100;
  const employeePension = round2(totalPensionableSalary * pensionRate);

  const maxEligiblePensionForCredit = round2(Number(settings.pensionCreditSalaryCap || 9700) * 0.07);
  const pensionTaxCredit = round2(
    Math.min(employeePension, maxEligiblePensionForCredit) * Number(settings.pensionTaxCreditRate || 0.35)
  );

  const grossIncomeTax = calculateGrossIncomeTax(taxableGross, settings.taxBrackets);
  const creditPointsDiscount = round2(
    Number(settings.creditPoints || 2.75) * Number(settings.creditPointValue || 242)
  );
  const incomeTax = round2(Math.max(0, grossIncomeTax - creditPointsDiscount - pensionTaxCredit));

  const { nationalInsurance, healthTax } = calculateNationalInsuranceAndHealth(taxableGross, settings);

  const totalDeductions = round2(incomeTax + nationalInsurance + healthTax + employeePension);
  const netToBank = round2(Math.max(0, cashGross - totalDeductions));

  return {
    year,
    month,
    daysInMonth,
    dailyResults,
    totals: {
      totalHours: round2(totalHours),
      totalRegularHours: round2(totalRegularHours),
      totalOt125Hours: round2(totalOt125Hours),
      totalOt150Hours: round2(totalOt150Hours),
      totalOt175Hours: round2(totalOt175Hours),
      totalOt200Hours: round2(totalOt200Hours),
      workedDaysCount,
      vacationDaysCount,
      sickDaysCount,
      totalWorkGross,
      travelAllowance,
      cashGross,
      tenBisValue,
      healthInsuranceImputed,
      taxableGross,
      totalPensionableSalary,
      employeePension,
      pensionTaxCredit,
      creditPointsDiscount,
      grossIncomeTax,
      incomeTax,
      nationalInsurance,
      healthTax,
      totalDeductions,
      netToBank
    }
  };
}

export function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

export function formatHours(hours) {
  const num = Number(hours) || 0;
  return num.toFixed(2);
}
