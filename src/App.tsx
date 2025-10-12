import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Download, Plus, Trash2, Copy, Menu as MenuIcon, Upload, Share2, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { openDB } from "idb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import confetti from "canvas-confetti";
import { createRoot } from "react-dom/client";

/**
 * ChemoCare – Offline-first web app for chemotherapy scheduling
 * Amendments in this version (per user request):
 * 1) PDF export: downloadable, printer-friendly PDF (via print-to-PDF) listing all upcoming treatments, appointments & medications.
 * 2) Background restyle: modern neomorphic pink→grey gradient with matte finish.
 * 3) Home UX: In the Upcoming list, show "days to go" first; date directly beneath; then item title; then notes.
 */

/******************** Utilities ********************/
function toISODate(d: Date) { const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return dt.toISOString().slice(0, 10); }
function parseISODate(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function diffDays(a: Date, b: Date) { const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate()); const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate()); return Math.round((d2.getTime()-d1.getTime())/(1000*60*60*24)); }
function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function pad(n: number) { return n.toString().padStart(2, "0"); }
function formatHuman(d: Date) { return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function formatTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function applyTime(date: Date, hhmm?: string) { if (!hhmm) return date; const [h, m] = hhmm.split(":").map(Number); const withTime = new Date(date); withTime.setHours(h||0, m||0, 0, 0); return withTime; }

// --- Day helpers: treatment is Day 1 ---
function dayToOffset(day: number) { return day >= 1 ? day - 1 : day; }
function normalizeDayInput(raw: any) {
  const n = Number.isFinite(raw) ? raw : parseInt(String(raw ?? ""), 10);
  if (isNaN(n)) return 1;
  return n === 0 ? 1 : n;
}
function useIsMobile(bp = 768) {
  const [m, setM] = useState<boolean>(() => typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => { const onR = () => setM(window.innerWidth < bp); window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR); }, [bp]);
  return m;
}

/******************** IndexedDB ********************/
const DB_NAME = "chemo-care-db";
const DB_VERSION = 12; // bumped for calendarName & wizard step
let dbPromise: Promise<any> | undefined;
async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("moves")) db.createObjectStore("moves");
        if (!db.objectStoreNames.contains("done")) db.createObjectStore("done");
      },
    });
  }
  return dbPromise;
}
async function saveSettings(settings: any) { const db = await getDB(); await db.put("settings", settings, "settings"); }
async function loadSettings() { const db = await getDB(); return (await db.get("settings","settings")) || null; }
async function saveMoves(moves: any[]) { const db = await getDB(); await db.put("moves", moves, "moves"); }
async function loadMoves() { const db = await getDB(); return (await db.get("moves","moves")) || [] as any[]; }
async function saveDone(done: Record<string, boolean>) { const db = await getDB(); await db.put("done", done, "done"); }
async function loadDone() { const db = await getDB(); return (await db.get("done","done")) || {} as Record<string, boolean>; }

/******************** i18n ********************/
const STRINGS = {
  en: {
    appName: "ChemoCare",
    shareExport: "Share / Export",
    shareTitle: "Share your calendar",
    language: "Language",
    english: "English",
    dutch: "Nederlands",
    reset: "Reset",
    setupTitle: "Set up your treatment plan",
    setupHelp: "Use the day indicator relative to treatment: <b>Day -1</b> (day before), <b>Day 1</b> (treatment), <b>Day 2</b> (day after). <b>Day 0 is not used.</b>",
    firstDate: "First treatment date",
    frequency: "Frequency (days)",
    cycles: "Number of cycles (optional)",
    medActions: "Actions per cycle (around treatment days)",
    medActionsHelp: "Use this for medication or tasks that repeat every cycle. Same-day meds? Add multiple actions with the same day.",
    dayHelpBtn: "Day help",
    dayHelpTitle: "How days work",
    dayExpl: "<p><b>Day 1</b> is the treatment day. <b>Day -1</b> is the day before. <b>Day 2</b> is the day after. Day 0 isn’t used.</p>",
    dayField: "Day (relative to treatment)",
    timeOfDay: "Time (optional)",
    title: "Title",
    notesOpt: "Notes (optional)",
    notes: "Notes",
    addAction: "Add action",
    duplicateAction: "Duplicate",
    savePlan: "Save plan",
    saved: "Saved!",
    nextAction: "Next action",
    dueToday: "Due today",
    daysWord: "day(s)",
    overdue: "overdue",
    toGo: "to go",
    nextTreatment: "Next treatment",
    today: "Today",
    upcoming: "Upcoming (next 12)",
    treatment: "Treatment",
    action: "Action",
    moveEllipsis: "Move…",
    treatmentOccurrence: "Treatment occurrence",
    currentDate: "Current date:",
    moveToDate: "Move to date",
    applyMove: "Apply move",
    moveHelp: "This shifts the chosen treatment to the new date; later ones follow your set frequency.",
    preparing: "Preparing…",
    exportICS: "Export .ics",
    exportPDF: "Export PDF",
    exportPDFDesc: "Creates a printer-friendly PDF list of all upcoming items.",
    shareBody: "Offline app: export an <code>.ics</code> and import into Outlook/Google/Apple. Re-export if you change the plan.",
    howToImport: "How to import",
    outlookDesktop: "<li><b>Outlook (desktop)</b>: File → Open & Export → Import/Export → Import iCalendar (.ics) → Choose the file.</li>",
    outlookWeb: "<li><b>Outlook (web)</b>: Calendar → Add calendar → Upload from file → Choose the file.</li>",
    googleCal: "<li><b>Google Calendar</b>: Settings → Import & export → Import → Select file → Choose destination calendar.</li>",
    appleCal: "<li><b>Apple Calendar</b>: File → Import → Choose the file.</li>",
    subNote: "For live subscription (webcal://), a tiny server can be added later.",
    tabs: { home: "Home", calendar: "Calendar", plan: "Plan", share: "Share" },
    weekdays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    prev: "Prev", next: "Next",
    cycleWord: (n:number)=>`Cycle ${n}`,
    menu: "Menu",

    courseProgress: "Course progress",
    progressPct: (n:number)=>`${n}% complete`,
    setCyclesHint: "Set the number of cycles to show progress.",
    cyclesCompletedSuffix: "cycles completed",
    oneOffsTitle: "Individual appointments & one-off meds",
    oneOffsHelp: "Use this for physio, surgeon or oncology appointments, or single medications on a specific date/time.",
    addOneOff: "Add item",
    addAppointment: "Add appointment",
    addMedication: "Add medication",
    date: "Date",
    type: "Type",
    appointment: "Appointment",
    medication: "Medication",
    shareInApp: "Share within the app",
    copyShareCode: "Copy share code",
    pasteShareCode: "Paste code",
    load: "Load",
    downloadFile: "Download file",
    uploadFile: "Upload file",
    importSuccess: "Imported! Your plan has been loaded.",
    importFail: "Couldn’t import that code/file.",
    copied: "Copied!",
    or: "or",
    startFromShare: "Start from a share code or file",

    // Wizard
    welcome: "Welcome",
    getStarted: "Get started",
    choosePath: "How do you want to start?",
    createPlan: "Create a plan",
    startWithImport: "Start with Import",
    back: "Back",
    continue: "Continue",

    // New: Calendar naming + quick add
    calendarNameLabel: "Calendar name (for sharing/import)",
    finish: "Finish",
    addAppointmentsStep: "Add appointments",
    quickAdd: "Quick add appointment",
  },
  nl: {
    appName: "ChemoCare",
    shareExport: "Delen / Exporteren",
    shareTitle: "Deel je agenda",
    language: "Taal",
    english: "Engels",
    dutch: "Nederlands",
    reset: "Resetten",
    setupTitle: "Stel je behandelplan in",
    setupHelp: "Gebruik de dagindicator t.o.v. de behandeling: <b>Dag -1</b> (dag vóór), <b>Dag 1</b> (behandeling), <b>Dag 2</b> (dag erna). <b>Dag 0 wordt niet gebruikt.</b>",
    firstDate: "Eerste behandelingsdatum",
    frequency: "Frequentie (dagen)",
    cycles: "Aantal cycli (optioneel)",
    medActions: "Acties per cyclus (rond behandelingsdagen)",
    medActionsHelp: "Gebruik dit voor medicatie of taken die elke cyclus terugkomen. Meerdere medicijnen op één dag? Voeg meerdere acties met dezelfde dag toe.",
    dayHelpBtn: "Uitleg dag",
    dayHelpTitle: "Hoe de dagen werken",
    dayExpl: "<p><b>Dag 1</b> is de dag van behandeling. <b>Dag -1</b> is de dag ervoor. <b>Dag 2</b> is de dag erna. Dag 0 gebruiken we niet.</p>",
    dayField: "Dag (t.o.v. behandeling)",
    timeOfDay: "Tijd (optioneel)",
    title: "Titel",
    notesOpt: "Notities (optioneel)",
    notes: "Notities",
    addAction: "Actie toevoegen",
    duplicateAction: "Dupliceren",
    savePlan: "Plan opslaan",
    saved: "Opgeslagen!",
    nextAction: "Volgende actie",
    dueToday: "Vandaag",
    daysWord: "dag(en)",
    overdue: "te laat",
    toGo: "te gaan",
    nextTreatment: "Volgende behandeling",
    today: "Vandaag",
    upcoming: "Aankomend (volgende 12)",
    treatment: "Behandeling",
    action: "Actie",
    moveEllipsis: "Verplaatsen…",
    treatmentOccurrence: "Behandelingsnummer",
    currentDate: "Huidige datum:",
    moveToDate: "Verplaatsen naar datum",
    applyMove: "Verplaatsing toepassen",
    moveHelp: "Dit verplaatst de gekozen behandeling; volgende behandelingen volgen de ingestelde frequentie.",
    preparing: "Voorbereiden…",
    exportICS: "Exporteer .ics",
    exportPDF: "Exporteer PDF",
    exportPDFDesc: "Maakt een printvriendelijke PDF-lijst van alle aankomende items.",
    shareBody: "Offline app: exporteer een <code>.ics</code> en importeer in Outlook/Google/Apple. Exporteer opnieuw bij wijzigingen.",
    howToImport: "Importeren",
    outlookDesktop: "<li><b>Outlook (desktop)</b>: Bestand → Openen & Exporteren → Importeren/Exporteren → iCalendar (.ics) importeren → Kies het bestand.</li>",
    outlookWeb: "<li><b>Outlook (web)</b>: Agenda → Agenda toevoegen → Uploaden vanaf bestand → Kies het bestand.</li>",
    googleCal: "<li><b>Google Agenda</b>: Instellingen → Importeren & exporteren → Importeren → Selecteer bestand → Kies doelagenda.</li>",
    appleCal: "<li><b>Apple Agenda</b>: Archief → Importeer → Kies het bestand.</li>",
    subNote: "Wil je live updates (webcal://)? Later kan een kleine server dit hosten.",
    tabs: { home: "Start", calendar: "Kalender", plan: "Plan", share: "Delen" },
    weekdays: ["Ma","Di","Wo","Do","Vr","Za","Zo"],
    prev: "Vorige", next: "Volgende",
    cycleWord: (n:number)=>`Cyclus ${n}`,
    menu: "Menu",

    courseProgress: "Voortgang traject",
    progressPct: (n:number)=>`${n}% voltooid`,
    setCyclesHint: "Stel het aantal cycli in om voortgang te tonen.",
    cyclesCompletedSuffix: "kuren voltooid",
    oneOffsTitle: "Aparte afspraken & losse medicatie",
    oneOffsHelp: "Gebruik dit voor fysio, chirurg of oncologie-afspraken, of eenmalige medicatie op een specifieke datum/tijd.",
    addOneOff: "Item toevoegen",
    addAppointment: "Afspraak toevoegen",
    addMedication: "Medicatie toevoegen",
    date: "Datum",
    type: "Type",
    appointment: "Afspraak",
    medication: "Medicatie",
    shareInApp: "Delen via de app",
    copyShareCode: "Deelcode kopiëren",
    pasteShareCode: "Code plakken",
    load: "Laden",
    downloadFile: "Bestand downloaden",
    uploadFile: "Bestand uploaden",
    importSuccess: "Geïmporteerd! Je plan is geladen.",
    importFail: "Importeren van code/bestand is mislukt.",
    copied: "Gekopieerd!",
    or: "of",
    startFromShare: "Begin met een deelcode of bestand",

    // Wizard
    welcome: "Welkom",
    getStarted: "Aan de slag",
    choosePath: "Hoe wil je beginnen?",
    createPlan: "Plan maken",
    startWithImport: "Start met Import",
    back: "Terug",
    continue: "Doorgaan",

    // New
    calendarNameLabel: "Agendanaam (voor delen/import)",
    finish: "Afronden",
    addAppointmentsStep: "Afspraken toevoegen",
    quickAdd: "Snel afspraak toevoegen",
  }
} as const;

type LocaleKey = keyof typeof STRINGS;
function useLocale() {
  const [locale, setLocale] = useState<LocaleKey>((localStorage.getItem("locale") as LocaleKey) || "nl");
  const t = STRINGS[locale];
  const changeLocale = (value: LocaleKey) => { setLocale(value); localStorage.setItem("locale", value); try { window.dispatchEvent(new CustomEvent("locale:changed", { detail: { locale: value } })); } catch {} };
  useEffect(() => { const h = () => setLocale((localStorage.getItem("locale") as LocaleKey) || "nl"); window.addEventListener("locale:changed", h); return () => window.removeEventListener("locale:changed", h); }, []);
  return { locale, t, changeLocale } as const;
}

/******************** Domain Model ********************/
type Series = { anchors: { index: number; date: Date }[]; frequencyDays: number };

function buildAnchors(startDateISO: string, frequencyDays: number, moves: { index: number; newDateISO: string }[]): Series {
  const anchors = [{ index: 0, date: parseISODate(startDateISO) }];
  const sorted = [...moves].sort((a, b) => a.index - b.index);
  for (const m of sorted) anchors.push({ index: m.index, date: parseISODate(m.newDateISO) });
  anchors.sort((a, b) => a.index - b.index);
  const dedup: { index: number; date: Date }[] = [];
  for (const a of anchors) { const last = dedup[dedup.length-1]; if (!last || last.index !== a.index) dedup.push(a); else dedup[dedup.length-1] = a; }
  return { anchors: dedup, frequencyDays };
}
function computeTreatmentDate(series: Series, occurrenceIndex: number) {
  const { anchors, frequencyDays } = series;
  let anchor = anchors[0];
  for (const a of anchors) { if (a.index <= occurrenceIndex) anchor = a; else break; }
  const delta = occurrenceIndex - anchor.index;
  return addDays(anchor.date, delta * frequencyDays);
}
function* iterateTreatments(series: Series, { fromDate, toDate, maxCount = 1000, cyclesCap = null }: { fromDate?: Date; toDate?: Date; maxCount?: number; cyclesCap?: number | null } = {}) {
  const first = computeTreatmentDate(series, 0);
  let startIndex = 0;
  if (fromDate) { const est = Math.floor(diffDays(first, fromDate) / series.frequencyDays); startIndex = Math.max(0, est - 3); }
  let count = 0;
  for (let i = startIndex; i < startIndex + maxCount; i++) {
    if (cyclesCap != null && i >= cyclesCap) break;
    const d = computeTreatmentDate(series, i);
    if (toDate && d > toDate) break;
    if (fromDate && d < fromDate) continue;
    yield { index: i, date: d } as { index: number; date: Date };
    count++; if (count >= maxCount) break;
  }
}
function buildEvents(settings: any, moves: any[], { monthsAhead = 12 } = {}) {
  if (!settings) return [] as any[];
  const now = new Date();
  const windowStart = addDays(new Date(now.getFullYear(), now.getMonth(), 1), -7);
  const windowEnd = addDays(new Date(now.getFullYear(), now.getMonth(), 1), monthsAhead * 31);

  const series = buildAnchors(settings.startDate, settings.frequencyDays, moves);
  const events: any[] = [];

  for (const { index, date } of iterateTreatments(series, { fromDate: windowStart, toDate: windowEnd, cyclesCap: settings.cycles ?? null })) {
    events.push({ id: `treat-${index}`, type: "treatment", title: `Treatment #${index + 1}`, date, index });

    for (const rule of settings.medRules || []) {
      if (!rule.enabled && rule.enabled !== undefined) continue;
      const offset = dayToOffset(rule.day);
      const actionDate = addDays(date, offset);
      const actionDateTime = applyTime(actionDate, rule.time);
      events.push({
        id: `act-${index}-${rule.id}`,
        type: "action",
        title: rule.title || `Dag ${rule.day}: actie`,
        date: actionDateTime,
        index,
        rule,
      });
    }
  }

  // One-offs
  for (const item of (settings.oneOffs || [])) {
    const d = parseISODate(item.dateISO);
    const dt = item.time ? applyTime(d, item.time) : d;
    events.push({
      id: `one-${item.id}`,
      type: "oneoff",
      title: item.title || (item.kind === "med" ? "Medication" : "Appointment"),
      date: dt,
      item,
    });
  }

  events.sort((a, b) => a.date - b.date || (a.type === "treatment" ? -1 : 1));
  return events;
}

/******************** Helpers ********************/
function mergeMoves(base: { index: number; newDateISO: string }[], add: { index: number; newDateISO: string }[]) {
  const m = new Map<number, string>(); for (const b of base) m.set(b.index, b.newDateISO); for (const a of add) m.set(a.index, a.newDateISO);
  return Array.from(m.entries()).map(([index, newDateISO]) => ({ index, newDateISO })).sort((x, y) => x.index - y.index);
}
function freezePastMoves(series: Series, cutoffDate: Date, cyclesCap: number | null) {
  const frozen: { index: number; newDateISO: string }[] = []; const max = 1000;
  for (let i=0;i<max;i++){ if (cyclesCap!=null && i>=cyclesCap) break; const d = computeTreatmentDate(series, i);
    if (d <= cutoffDate) frozen.push({ index: i, newDateISO: toISODate(d) }); else break; }
  return frozen;
}
function daysUntil(date: Date) { const today = new Date(); return diffDays(today, date); }

/******************** ICS ********************/
function toICSDate(d: Date) { return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`; }
function toICSTime(d: Date) { return `${pad(d.getHours())}${pad(d.getMinutes())}00`; }
function generateICS(events: any[], { calendarName = "ChemoCare" } = {}) {
  const t = STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"];
  const lines: string[] = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ChemoCare//EN",`X-WR-CALNAME:${calendarName}`];
  for (const ev of events) {
    const uid = `${ev.id}@chemocare.local`;
    const title = ev.type === "treatment" ? `${t.treatment} #${ev.index + 1}` : `${ev.title}`;
    const desc = ev.type === "treatment" ? t.cycleWord(ev.index + 1) : (ev.rule?.notes || ev.item?.notes || "");
    const stamp = `${toICSDate(new Date())}T000000Z`;

    if ((ev.type === "action" && ev.rule?.time) || (ev.type === "oneoff" && ev.item?.time)) {
      const dt = ev.date as Date;
      const start = `${toICSDate(dt)}T${toICSTime(dt)}`;
      const endDt = new Date(dt.getTime()+60*60*1000); // 1h
      const end = `${toICSDate(endDt)}T${toICSTime(endDt)}`;
      lines.push("BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${stamp}`,`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${title}`,`DESCRIPTION:${(desc||"").replace(/\\n/g,"\\\\n")}`,"END:VEVENT");
    } else {
      const dtStart = toICSDate(ev.date);
      const dtEnd = toICSDate(addDays(ev.date, 1));
      lines.push("BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${dtStart}`,`DTEND;VALUE=DATE:${dtEnd}`,`SUMMARY:${title}`,`DESCRIPTION:${(desc||"").replace(/\\n/g,"\\\\n")}`,"END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function downloadICS(content: string, filename = "chemocare.ics") {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); safeRemove(a); URL.revokeObjectURL(url);
}

/******************** PDF (Printer-friendly) ********************/
/**
 * Creates a printer-friendly view and opens the system's "Save as PDF" dialog.
 * This is the most reliable, dependency-free way to generate a proper PDF in-browser.
 */
function openPdfOfUpcoming(events: any[], calendarName: string) {
  const today = new Date();
  const upcoming = events.filter(ev => diffDays(today, ev.date) >= 0);
  const fmtDate = (d: Date, withTime: boolean) => withTime ? `${formatHuman(d)} · ${formatTime(d)}` : formatHuman(d);
  const daysToGo = (d: Date) => {
    const n = diffDays(today, d);
    if (n < 0) return `${Math.abs(n)} ${STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].overdue}`;
    if (n === 0) return STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].today;
    return `${n} ${STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].daysWord} ${STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].toGo}`;
  };
  const labelFor = (ev: any) => {
    const t = STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"];
    return ev.type === "treatment" ? t.treatment : (ev.type === "oneoff" ? (ev.item?.kind === "med" ? t.medication : t.appointment) : t.action);
  };
  const hasTime = (ev: any) => (ev.type === "action" && ev.rule?.time) || (ev.type === "oneoff" && ev.item?.time);

  const rows = upcoming.map(ev => {
    const name = ev.type === "treatment" ? `${STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].treatment} #${ev.index + 1}` : ev.title;
    const notes = (ev.rule?.notes || ev.item?.notes || "").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `
      <tr>
        <td class="c-days">${daysToGo(ev.date)}</td>
        <td class="c-date">${fmtDate(ev.date, hasTime(ev))}</td>
        <td class="c-type">${labelFor(ev)}</td>
        <td class="c-title">${name}</td>
        <td class="c-notes">${notes || ""}</td>
      </tr>`;
  }).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${calendarName} – Upcoming export</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 12pt/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; color: #0f172a; }
  h1 { font-size: 20pt; margin: 0 0 10px 0; }
  .meta { font-size: 10pt; color: #475569; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 10pt; color: #475569; font-weight: 600; background: #f8fafc; }
  td.c-days { white-space: nowrap; font-weight: 600; }
  td.c-date { white-space: nowrap; color: #334155; }
  td.c-type { white-space: nowrap; }
  .footer { margin-top: 10px; font-size: 9pt; color: #64748b; }
  .print-hint { margin-top: 6px; font-size: 9pt; color: #64748b; }
</style>
</head>
<body>
  <h1>${calendarName} — Upcoming</h1>
  <div class="meta">Generated on ${formatHuman(new Date())}</div>
  <table>
    <thead>
      <tr>
        <th>Days</th>
        <th>Date</th>
        <th>Type</th>
        <th>Title</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Includes all future treatments, appointments, and medications from your current plan.</div>
  <script>window.print();</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  // Cleanup when the window is closed
  const timer = setInterval(() => {
    if (w && w.closed) {
      clearInterval(timer);
      URL.revokeObjectURL(url);
    }
  }, 1000);
}

/******************** DOM safety ********************/
function safeRemove(node: any){
  try {
    if (!node) return;
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    } else if (typeof node.remove === "function") {
      try { node.remove(); } catch {}
    }
  } catch {}
}
/******************** UI Bits ********************/

function GlobalStyles() {
  return (
    <style>{`
      /* Neomorphic pink→grey matte background */
      html, body, #root { height: 100%; }
      /* ——— Background: soft blush-on-slate gradient + grain + vignette ——— */
      :root{
        --bg-1: #f1f5f9;           /* light slate */
        --bg-2: #f8e7f1;           /* blush */
        --bg-3: #eef2ff;           /* indigo tint */
        --bg-4: #fafaf9;           /* warm paper */
        --glow: rgba(255,182,193,0.28); /* pink glow */
      }

      body{
        margin: 0;
        color: #0f172a;
        background:
          /* soft corner glows */
          radial-gradient(900px 600px at 12% 8%, var(--glow), transparent 60%),
          radial-gradient(800px 500px at 88% 10%, rgba(147,197,253,0.18), transparent 62%),
          /* main diagonal wash */
          linear-gradient(135deg, var(--bg-2) 0%, var(--bg-4) 35%, var(--bg-1) 65%, var(--bg-3) 100%);
        background-attachment: fixed;
      }

      /* subtle matte grain + vignette */
      body::before{
        content:"";
        position: fixed;
        inset: 0;
        pointer-events: none;
        /* grain */
        background:
          radial-gradient(1200px 900px at 50% 10%, rgba(255,255,255,.5), transparent 45%),
          radial-gradient(1000px 900px at 50% 120%, rgba(0,0,0,.06), transparent 55%),
          /* faux-noise using tiny dots */
          radial-gradient(1px 1px at 10% 20%, rgba(0,0,0,.025) 50%, transparent 51%),
          radial-gradient(1px 1px at 30% 80%, rgba(0,0,0,.02) 50%, transparent 51%),
          radial-gradient(1px 1px at 70% 30%, rgba(0,0,0,.02) 50%, transparent 51%),
          radial-gradient(1px 1px at 85% 60%, rgba(0,0,0,.02) 50%, transparent 51%);
        background-size:
          100% 100%,
          100% 100%,
          3px 3px,
          3px 3px,
          3px 3px,
          3px 3px;
        mix-blend-mode: soft-light;
        opacity: .8;
      }

      /* ——— Make the language Select look like the buttons ——— */
      [role="combobox"][aria-haspopup="listbox"]{
        background: linear-gradient(180deg, #ffffff, #fafafa);
        border: 1px solid rgba(2,6,23,0.10);
        border-radius: 12px;
        height: 40px;             /* aligns with your Button height */
        padding: 0 12px;
        box-shadow:
          0 8px 18px rgba(31,41,55,0.08),
          inset 0 -1px 0 rgba(255,255,255,0.65);
        transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease;
      }

      /* Hover: lift slightly, deepen shadow */
      [role="combobox"][aria-haspopup="listbox"]:hover{
        transform: translateY(-1px);
        box-shadow:
          0 10px 20px rgba(31,41,55,0.10),
          inset 0 -1px 0 rgba(255,255,255,0.7);
        border-color: rgba(2,6,23,0.14);
      }

      /* Focus-visible ring to match shadcn focus */
      [role="combobox"][aria-haspopup="listbox"]:focus-visible{
        outline: none;
        box-shadow:
          0 0 0 3px rgba(59,130,246,0.25),
          0 10px 20px rgba(31,41,55,0.10),
          inset 0 -1px 0 rgba(255,255,255,0.7);
        border-color: rgba(59,130,246,0.45);
      }

      /* Open state: keep it “pressed” */
      [role="combobox"][aria-haspopup="listbox"][aria-expanded="true"]{
        transform: translateY(0);
        box-shadow:
          0 6px 14px rgba(31,41,55,0.08),
          inset 0 1px 0 rgba(0,0,0,0.04);
      }

      /* Make the dropdown panel feel consistent (optional but tiny) */
      [data-radix-popper-content-wrapper] .radix-select-content,
      [data-radix-popper-content-wrapper] [role="listbox"]{
        background: linear-gradient(180deg, #ffffff, #f9fafb);
        border: 1px solid rgba(2,6,23,0.08);
        box-shadow: 0 18px 40px rgba(2,6,23,0.15);
        backdrop-filter: blur(6px);
      }


      .cc-app-shell { min-height: 100vh; }
      .cc-container { width: 100%; max-width: 1080px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
      @media (max-width: 640px) {
        .cc-container { padding: 12px; }
      }

      /* Fixed min width for chips */
      .cc-chip{
        display: inline-flex;          /* allows width to apply on inline element */
        min-width: 90px;               /* your requirement */
        justify-content: center;       /* keep the label centered */
        align-items: center;           /* vertical alignment */
      }


      /* Neomorphic cards */
      .cc-card-pad { padding: 24px; }
      @media (max-width: 640px) { .cc-card-pad { padding: 16px; } }
/* ——— Sticky tabs: glassier + crisper border ——— */
.cc-tabs{
  position: sticky; top: 0; z-index: 20;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.72));
  backdrop-filter: blur(8px) saturate(120%);
  border: 1px solid rgba(2,6,23,0.08);
  padding: 6px; margin-bottom: 8px;
  box-shadow:
    12px 12px 24px rgba(210,175,189,0.30),
    -10px -10px 22px rgba(255,255,255,0.75);
}

      /* Inputs/rows grid */
      .cc-rule-row { 
        display: grid; 
        gap: 0.75rem; 
        align-items: start; 
        position: relative;
        overflow: hidden;
        background: linear-gradient(180deg, #ffffff, #fafafa);
        box-shadow: 9px 9px 18px rgba(210, 175, 189, 0.25), -9px -9px 18px rgba(255,255,255,0.9);
        border-radius: 16px;
        border: 1px solid rgba(2,6,23,0.06);
      }
      @media (min-width: 768px) {
        .cc-rule-row {
          grid-template-columns:
            9.5rem
            7.5rem
            minmax(0, 1.1fr)
            minmax(0, 1fr)
            max-content;
        }
        .cc-rule-row .cc-controls { 
          padding-top: 26px; 
          justify-self: end;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          white-space: nowrap;
        }
      }
      .cc-rule-row > * { min-width: 0; max-width: 100%; }
      .cc-toast { position: fixed; right: 16px; bottom: 16px; z-index: 50; }
      .cc-progress { height: 10px; border-radius: 9999px; background: rgba(2,6,23,0.08); overflow: hidden; }
      .cc-progress > span { display: block; height: 100%; background: #22c55e; transition: width .25s ease; }
      .cc-stepper { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .cc-step { text-align: center; font-size: 12px; opacity: .7; }
      .cc-step.active { font-weight: 600; opacity: 1; }
      textarea { resize: vertical; max-height: 140px; }
      
      /* ——— Make header buttons visually match the language Select ——— */
      .cc-elevated{
        background: linear-gradient(180deg, #ffffff, #fafafa);
        border: 1px solid rgba(2,6,23,0.10);
        border-radius: 12px;
        height: 40px;                 /* same as SelectTrigger */
        padding: 0 12px;               /* keep spacing consistent */
        box-shadow:
          0 8px 18px rgba(31,41,55,0.08),
          inset 0 -1px 0 rgba(255,255,255,0.65);
        transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease;
      }

      .cc-elevated:hover{
        transform: translateY(-1px);
        box-shadow:
          0 10px 20px rgba(31,41,55,0.10),
          inset 0 -1px 0 rgba(255,255,255,0.7);
        border-color: rgba(2,6,23,0.14);
      }

      .cc-elevated:focus-visible{
        outline: none;
        box-shadow:
          0 0 0 3px rgba(59,130,246,0.25),
          0 10px 20px rgba(31,41,55,0.10),
          inset 0 -1px 0 rgba(255,255,255,0.7);
        border-color: rgba(59,130,246,0.45);
      }

      /* keep icon + text aligned nicely */
      .cc-elevated svg{ width: 1rem; height: 1rem; margin-right: .5rem; }


    `}</style>
  );
}
function DayInfo({ t }: { t: any }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label={t.dayHelpBtn} className="inline-flex items-center justify-center align-middle w-5 h-5 rounded-full border text-[10px] leading-none ml-1 hover:bg-gray-100" title={t.dayHelpTitle}>?</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        <div dangerouslySetInnerHTML={{ __html: t.dayExpl }} />
      </PopoverContent>
    </Popover>
  );
}
function DayInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => {
    const vstr = String(value);
    if (text !== vstr && text !== "" && text !== "-") setText(vstr);
  }, [value]); // eslint-disable-line

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (v === "0" || v === "-0") v = "1";
    setText(v);
    const n = Number(v);
    if (!Number.isNaN(n) && n !== 0) onChange(n);
  };
  const commit = () => {
    const n = Number(text);
    const normalized = (!Number.isNaN(n) ? (n === 0 ? 1 : n) : 1);
    setText(String(normalized));
    onChange(normalized);
  };
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="-?[0-9]*"
      value={text}
      onChange={handleChange}
      onBlur={commit}
      onWheel={(e) => {
        if (document.activeElement === e.currentTarget) {
          e.preventDefault();
          const cur = Number.isNaN(Number(text)) ? value : Number(text) || 1;
          let next = (e as any).deltaY < 0 ? cur + 1 : cur - 1;
          if (next === 0) next += (e as any).deltaY < 0 ? 1 : -1;
          setText(String(next)); onChange(next);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const cur = Number.isNaN(Number(text)) ? value : Number(text) || 1;
          let next = e.key === "ArrowUp" ? cur + 1 : cur - 1;
          if (next === 0) next += e.key === "ArrowUp" ? 1 : -1;
          setText(String(next)); onChange(next);
        }
        if (e.key === "Enter") { e.preventDefault(); commit(); }
      }}
    />
  );
}
function fireConfettiAtClient(clientX?: number, clientY?: number) {
  try {
    const x = clientX != null ? clientX / window.innerWidth : 0.5;
    const y = clientY != null ? clientY / window.innerHeight : 0.35;
    confetti({ particleCount: 90, spread: 65, startVelocity: 40, gravity: 0.9, scalar: 1, ticks: 160, origin: { x, y } });
  } catch {}
}

/* Progress donut */
function DonutProgress({ pct }: { pct: number }) {
  const r = 36; const c = 2 * Math.PI * r; const off = c * (1 - pct);
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="12" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(34,197,94)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 50 50)" />
      <text x="50" y="54" textAnchor="middle" className="text-sm fill-current">{Math.round(pct*100)}%</text>
    </svg>
  );
}
function countCompletedTreatments(settings: any, moves: any[], asOf = new Date()) {
  if (!settings) return { done: 0, total: 0 };
  const series = buildAnchors(settings.startDate, settings.frequencyDays, moves);
  let i = 0, done = 0;
  const cap = settings.cycles ?? 9999;
  while (i < cap) {
    const d = computeTreatmentDate(series, i);
    if (d <= asOf) done++;
    else break;
    i++;
  }
  return { done, total: settings.cycles ?? 0 };
}

/* Share encode/decode */
function encodeShare(obj: any) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeShare(code: string) {
  const json = decodeURIComponent(escape(atob(code)));
  return JSON.parse(json);
}

/*** Header ***/
function Header({ onReset }: { onReset: () => void }) {
  const { locale, t, changeLocale } = useLocale();
  const mobile = useIsMobile();

  return (
    <div className="w-full flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="text-2xl font-bold">{t.appName}</h1>
      </div>

      {!mobile ? (
        <div className="flex gap-2 items-center">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline" className="cc-elevated"><Share2 className="w-4 h-4 mr-2" />{t.shareExport}</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>{t.shareTitle}</DialogTitle></DialogHeader><SharePanel /></DialogContent>
          </Dialog>

          <Select value={locale} onValueChange={(v)=>changeLocale(v as LocaleKey)}>
            <SelectTrigger className="w-[120px] cc-elevated"><SelectValue placeholder={t.language} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t.english}</SelectItem>
              <SelectItem value="nl">{t.dutch}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="secondary" className="cc-elevated" onClick={onReset}><Trash2 className="w-4 h-4 mr-2"/>{t.reset}</Button>
        </div>
      ) : (
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" size="icon" aria-label={t.menu}><MenuIcon className="w-5 h-5" /></Button></SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] overflow-auto">
            <SheetHeader><SheetTitle>{t.menu}</SheetTitle></SheetHeader>

            <div className="mt-4 space-y-6">
              <section className="space-y-3">
                <h3 className="font-medium">{t.shareTitle}</h3>
                <SharePanel />
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">{t.language}</h3>
                <Select value={locale} onValueChange={(v)=>changeLocale(v as LocaleKey)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t.english}</SelectItem>
                    <SelectItem value="nl">{t.dutch}</SelectItem>
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Reset</h3>
                <Button variant="secondary" onClick={onReset} className="w-full"><Trash2 className="w-4 h-4 mr-2"/>{t.reset}</Button>
              </section>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/*** Setup Wizard (reused for Create path) ***/
function SetupWizard({ onComplete, hideInlineImport = false }: { onComplete: (settings: any) => void; hideInlineImport?: boolean }) {
  const { t } = useLocale();
  const [startDate, setStartDate] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(21);
  const [cycles, setCycles] = useState<any>(6);
  const [calendarName, setCalendarName] = useState<string>("ChemoCare"); // NEW: calendar name
  const [medRules, setMedRules] = useState([
    { id: crypto.randomUUID(), day: -1, title: "Day -1: premedication", notes: "", time: "", enabled: true },
    { id: crypto.randomUUID(), day: 2, title: "Day 2: post-medication", notes: "", time: "", enabled: true },
  ]);

  // NEW: Prefill wizard with previously saved settings so coming back does not "lose" the plan
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      if (s) {
        setStartDate(s.startDate || "");
        setFrequencyDays(s.frequencyDays || 21);
        setCycles(s.cycles ?? 6);
        setCalendarName(s.calendarName || "ChemoCare");
        if (Array.isArray(s.medRules) && s.medRules.length) {
          setMedRules(s.medRules.map((r: any) => ({ ...r, day: normalizeDayInput(typeof r.day === "number" ? r.day : r.offset ?? 1) })));
        }
      }
    })();
  }, []);

  const addRule = () => setMedRules(r => [...r, { id: crypto.randomUUID(), day: 1, title: "Day 1: action", notes: "", time: "", enabled: true }]);
  const updateRule = (id: string, patch: any) => setMedRules(r => r.map(x => x.id === id ? { ...x, ...patch, day: normalizeDayInput(patch.day ?? x.day) } : x));
  const deleteRule = (id: string) => setMedRules(r => r.filter(x => x.id !== id));
  const duplicateRule = (rule: any) => setMedRules(r => [...r, { ...rule, id: crypto.randomUUID() }]);

  const canSave = startDate && frequencyDays >= 1;

  // Inline import (optional if not hidden)
  const importRef = useRef<HTMLInputElement>(null);
  const [shareCode, setShareCode] = useState("");

  const importFromCode = async () => {
    try {
      const bundle = decodeShare(shareCode.trim());
      if (!bundle?.settings) throw new Error("bad");
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves || []);
      onComplete(bundle.settings);
    } catch { alert(t.importFail); }
  };
  const importFromFile = async (file?: File) => {
    try {
      if (!file) return;
      const txt = await file.text();
      const bundle = JSON.parse(txt);
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves || []);
      onComplete(bundle.settings);
    } catch { alert(t.importFail); }
  };

  return (
    <div className="grid gap-6">
      <Card className="max-w-3xl mx-auto">
        <CardContent className="cc-card-pad">
          <h2 className="text-xl font-semibold mb-2">{t.setupTitle}</h2>
          <p className="text-sm opacity-80 mb-4" dangerouslySetInnerHTML={{ __html: t.setupHelp }} />

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div><Label>{t.firstDate}</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label>{t.frequency}</Label><Input type="number" step={1} min={1} value={frequencyDays} onChange={e => setFrequencyDays(parseInt(e.target.value || "0", 10))} /></div>
            <div><Label>{t.cycles}</Label><Input type="number" step={1} min={1} value={cycles} onChange={e => setCycles(e.target.value === "" ? "" : parseInt(e.target.value, 10))} /></div>
          </div>

          <div className="mb-6">
            <Label>{t.calendarNameLabel}</Label>
            <Input value={calendarName} onChange={(e)=>setCalendarName(e.target.value)} />
          </div>

          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-medium">{t.medActions}</h3>
              <p className="text-xs opacity-70">{t.medActionsHelp}</p>
            </div>
            <Button variant="outline" onClick={addRule}><Plus className="w-4 h-4 mr-2"/>{t.addAction}</Button>
          </div>

          <div className="space-y-2 mb-4">
            {medRules.map(rule => (
              <div key={rule.id} className="cc-rule-row p-3">
                <div>
                  <div className="flex items-center gap-1"><Label className="text-xs">{t.dayField}</Label><DayInfo t={t} /></div>
                  <DayInput value={rule.day} onChange={(n)=>updateRule(rule.id, { day: n })} />
                </div>
                <div><Label className="text-xs">{t.timeOfDay}</Label><Input type="time" value={rule.time || ""} onChange={e => updateRule(rule.id, { time: e.target.value })} /></div>
                <div><Label className="text-xs">{t.title}</Label><Input value={rule.title} onChange={e => updateRule(rule.id, { title: e.target.value })} /></div>
                <div><Label className="text-xs">{t.notesOpt}</Label><Textarea rows={2} value={rule.notes} onChange={e => updateRule(rule.id, { notes: e.target.value })} /></div>
                <div className="cc-controls flex items-center gap-2">
                  <Checkbox checked={rule.enabled} onCheckedChange={v => updateRule(rule.id, { enabled: !!v })} />
                  <Button size="icon" variant="ghost" onClick={() => duplicateRule(rule)} title={t.duplicateAction}><Copy className="w-4 h-4"/></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="w-4 h-4"/></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button disabled={!canSave} onClick={async () => {
              const settings = {
                startDate,
                frequencyDays,
                cycles: cycles === "" ? null : cycles,
                medRules: medRules.map(m => ({ ...m, day: normalizeDayInput(m.day) })),
                oneOffs: [],
                calendarName: calendarName?.trim() || "ChemoCare",
              };
              await saveSettings(settings);
              await saveMoves([]);
              onComplete(settings);
            }}>{t.savePlan}</Button>
          </div>
        </CardContent>
      </Card>

      {!hideInlineImport && (
        <Card className="max-w-3xl mx-auto">
          <CardContent className="cc-card-pad">
            <h3 className="font-medium mb-2">{t.startFromShare}</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4 mr-2" />{t.uploadFile}</Button>
              <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e)=>importFromFile(e.target.files?.[0]||undefined)} />
            </div>
            <Label className="text-xs">{t.pasteShareCode}</Label>
            <Textarea rows={3} value={shareCode} onChange={(e)=>setShareCode(e.target.value)} />
            <div className="mt-2">
              <Button onClick={importFromCode}>{t.load}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/*** Import-only panel (wizard Import path) ***/
function ImportPanel({ onComplete }: { onComplete: (settings: any) => void }) {
  const { t } = useLocale();
  const [code, setCode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFromCode = async () => {
    try {
      const bundle = decodeShare(code.trim());
      if (!bundle?.settings) throw new Error("bad");
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves || []);
      alert(t.importSuccess);
      onComplete(bundle.settings);
    } catch { alert(t.importFail); }
  };
  const uploadJson = async (file?: File) => {
    try {
      if (!file) return;
      const txt = await file.text();
      const bundle = JSON.parse(txt);
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves||[]);
      alert(t.importSuccess);
      onComplete(bundle.settings);
    } catch { alert(t.importFail); }
  };

  return (
    <Card className="max-w-3xl mx-auto">
      <CardContent className="cc-card-pad">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={()=>fileRef.current?.click()}><Upload className="w-4 h-4 mr-2" />{t.uploadFile}</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e)=>uploadJson(e.target.files?.[0]||undefined)} />
          </div>
          <div>
            <Label className="text-xs">{t.pasteShareCode}</Label>
            <Textarea rows={3} value={code} onChange={(e)=>setCode(e.target.value)} />
            <div className="mt-2">
              <Button onClick={loadFromCode}>{t.load}</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/*** Add Appointments Step for Wizard ***/
function WizardAddAppointments({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const { t } = useLocale();
  const [vals, setVals] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setVals(s ? { ...s, oneOffs: Array.isArray(s.oneOffs) ? s.oneOffs : [] } : null);
    })();
  }, []);

  const updateOneOff = (id: string, patch: any) => setVals((v:any)=>({ ...v, oneOffs: (v.oneOffs||[]).map((o:any)=>o.id===id?{...o,...patch}:o) }));
  const addOneOff = () => setVals((v:any)=>({ ...v, oneOffs: [...(v.oneOffs||[]), { id: crypto.randomUUID(), dateISO: "", time: "", title: "", notes: "", kind: "appointment" }] }));
  const deleteOneOff = (id: string) => setVals((v:any)=>({ ...v, oneOffs: (v.oneOffs||[]).filter((o:any)=>o.id!==id) }));

  if (!vals) return <Card className="max-w-3xl mx-auto"><CardContent className="cc-card-pad">{t.preparing}</CardContent></Card>;

  return (
    <Card className="max-w-3xl mx-auto">
      <CardContent className="cc-card-pad">
        <div className="mb-3"><Button variant="outline" onClick={onBack}>{t.back}</Button></div>
        <h3 className="font-medium mb-1">{t.addAppointmentsStep}</h3>
        <p className="text-xs opacity-70 mb-3">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].oneOffsHelp}</p>

        <div className="space-y-2 mb-3">
          {(vals.oneOffs || []).map((o:any) => (
            <div key={o.id} className="cc-rule-row p-3">
              <div>
                <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].date}</Label>
                <Input type="date" value={o.dateISO} onChange={e=>updateOneOff(o.id,{dateISO:e.target.value})}/>
              </div>
              <div>
                <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].timeOfDay}</Label>
                <Input type="time" value={o.time||""} onChange={e=>updateOneOff(o.id,{time:e.target.value})}/>
              </div>
              <div>
                <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].title}</Label>
                <Input value={o.title} onChange={e=>updateOneOff(o.id,{title:e.target.value})}/>
              </div>
              <div>
                <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].notes}</Label>
                <Textarea rows={2} value={o.notes||""} onChange={e=>updateOneOff(o.id,{notes:e.target.value})}/>
              </div>
              <div className="cc-controls flex items-center gap-2">
                <Select value={o.kind} onValueChange={(v)=>updateOneOff(o.id,{kind:v})}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder={STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].type}/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="appointment">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].appointment}</SelectItem>
                    <SelectItem value="med">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].medication}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={()=>deleteOneOff(o.id)}><Trash2 className="w-4 h-4"/></Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" onClick={addOneOff}><Plus className="w-4 h-4 mr-2"/>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].addAppointment}</Button>
          <Button variant="outline" onClick={()=>setVals((v:any)=>({ ...v, oneOffs: [...(v.oneOffs||[]), { id: crypto.randomUUID(), dateISO: "", time: "", title: "", notes: "", kind: "med" }] }))}><Plus className="w-4 h-4 mr-2"/>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].addMedication}</Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={async ()=>{ await saveSettings(vals); onFinish(); }}>{t.finish}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/*** First-launch Wizard wrapper ***/
function FirstLaunchWizard({ onDone, onReset }: { onDone: () => void; onReset: () => void }) {
  const { t } = useLocale();
  // Steps: 0 choose path, 1 create, 2 add-appointments (if create path), 3 import
  const [step, setStep] = useState<0|1|2|3>(0);
  const [inCreateFlow, setInCreateFlow] = useState(false);
  const totalSteps = 4;
  const pct = ((step + 1) / totalSteps) * 100;

  return (
    <div className="cc-app-shell">
      <div className="cc-container">
        <Header onReset={onReset} />
        <GlobalStyles />
        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <CardContent className="cc-card-pad">
              <div className="mb-3">
                <div className="cc-progress"><span style={{ width: pct + '%' }} /></div>
                <div className="cc-stepper mt-2">
                  <div className={`cc-step ${step===0?'active':''}`}>{t.welcome}</div>
                  <div className={`cc-step ${step===1?'active':''}`}>{t.createPlan}</div>
                  <div className={`cc-step ${step===2?'active':''}`}>{t.addAppointmentsStep}</div>
                  <div className={`cc-step ${step===3?'active':''}`}>{t.startWithImport}</div>
                </div>
              </div>

              {step === 0 && (<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
                <div className="text-center">
                  <h2 className="text-2xl font-semibold mb-1">{t.getStarted}</h2>
                  <p className="text-sm opacity-70 mb-4">{t.choosePath}</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={()=>{ setStep(1); setInCreateFlow(true); }}>{t.createPlan}</Button>
                    <Button variant="outline" onClick={()=>{ setStep(3); setInCreateFlow(false); }}>{t.startWithImport}</Button>
                  </div>
                </div>
              </motion.div>)}

              {step === 1 && (<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
                <div>
                  <div className="mb-3"><Button variant="outline" onClick={()=>setStep(0)}>{t.back}</Button></div>
                  <SetupWizard hideInlineImport onComplete={()=> setStep(2)} />
                </div>
              </motion.div>)}

              {step === 2 && inCreateFlow && (<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
                <WizardAddAppointments onBack={()=>setStep(1)} onFinish={()=>onDone()} />
              </motion.div>)}

              {step === 3 && (<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
                <div>
                  <div className="mb-3"><Button variant="outline" onClick={()=>setStep(0)}>{t.back}</Button></div>
                  <ImportPanel onComplete={()=>onDone()} />
                </div>
              </motion.div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/*** Quick Add Appointment modal (reusable) ***/
function QuickAddAppointment({ onAdded }: { onAdded: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [dateISO, setDateISO] = useState<string>(toISODate(new Date()));
  const [time, setTime] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const save = async () => {
    const s = await loadSettings();
    if (!s) return;
    const oneOffs = Array.isArray(s.oneOffs) ? s.oneOffs : [];
    oneOffs.push({ id: crypto.randomUUID(), dateISO, time, title: title || STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].appointment, notes, kind: "appointment" });
    await saveSettings({ ...s, oneOffs });
    setOpen(false);
    setTitle(""); setNotes(""); setTime("");
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="w-4 h-4 mr-2"/>{t.addAppointment}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t.quickAdd}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].date}</Label><Input type="date" value={dateISO} onChange={e=>setDateISO(e.target.value)} /></div>
          <div><Label>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].timeOfDay}</Label><Input type="time" value={time} onChange={e=>setTime(e.target.value)} /></div>
          <div><Label>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].title}</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder={STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].appointment} /></div>
          <div><Label>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].notes}</Label><Textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></div>
          <div className="flex justify-end"><Button onClick={save}>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].addAppointment}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/*** Home ***/
function Home({ settings, moves, refresh }: { settings: any; moves: any[]; refresh: () => void }) {
  const { t } = useLocale();
  const events = useMemo(() => buildEvents(settings, moves, { monthsAhead: 18 }), [settings, moves]);
  const today = new Date();
  const nextActionEv = events.find(ev => ev.type === "action" && diffDays(today, ev.date) >= 0);
  const nextTreatmentEv = events.find(ev => ev.type === "treatment" && diffDays(today, ev.date) >= 0);

  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { (async () => setDone(await loadDone()))(); }, [settings, moves]);
  const toggleDone = async (id: string, val: boolean) => { const d = { ...done, [id]: val }; await saveDone(d); setDone(d); };

  const upcoming = events.filter(ev => diffDays(today, ev.date) >= 0).slice(0, 12);

  const labelFor = (ev: any) => ev.type === "treatment" ? t.treatment : (ev.type === "oneoff" ? (ev.item?.kind === "med" ? t.medication : t.appointment) : t.action);
  const hasTime = (ev: any) => (ev.type === "action" && ev.rule?.time) || (ev.type === "oneoff" && ev.item?.time);

  const badgeColor = (ev: any) => {
    if (ev.type === "treatment") return "bg-green-100";
    if (ev.type === "action") return "bg-yellow-100";
    if (ev.type === "oneoff" && ev.item?.kind === "med") return "bg-purple-100";
    if (ev.type === "oneoff" && ev.item?.kind === "appointment") return "bg-blue-100";
    return "bg-yellow-100";
  };

  const daysToGoText = (d: Date) => {
    const n = diffDays(today, d);
    if (n < 0) return `${Math.abs(n)} ${t.overdue}`;
    if (n === 0) return t.today;
    return `${n} ${t.daysWord} ${t.toGo}`;
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardContent className="cc-card-pad">
          <h3 className="font-semibold mb-3">{t.nextAction}</h3>
          {nextActionEv ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border ${isSameDay(nextActionEv.date, today) ? "bg-yellow-50" : "bg-gray-50"}`}>
              <div className="text-sm font-semibold">{daysToGoText(nextActionEv.date)}</div>
              <div className="text-sm opacity-80">{formatHuman(nextActionEv.date)}{nextActionEv.rule?.time ? ` · ${formatTime(nextActionEv.date)}` : ""}</div>
              <div className="text-lg font-medium mt-1">{nextActionEv.title}</div>
              {nextActionEv.rule?.notes ? (<div className="text-xs opacity-70 mt-1 whitespace-pre-wrap">{nextActionEv.rule.notes}</div>) : null}
            </motion.div>
          ) : <p className="opacity-70">-</p>}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardContent className="cc-card-pad">
          <h3 className="font-semibold mb-3">{t.nextTreatment}</h3>
          {nextTreatmentEv ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border ${isSameDay(nextTreatmentEv.date, today) ? "bg-green-50" : "bg-gray-50"}`}>
              <div className="text-sm font-semibold">{daysToGoText(nextTreatmentEv.date)}</div>
              <div className="text-sm opacity-80">{formatHuman(nextTreatmentEv.date)}</div>
              <div className="text-lg font-medium mt-1">{`${t.treatment} #${nextTreatmentEv.index + 1}`}</div>
            </motion.div>
          ) : <p className="opacity-70">-</p>}
        </CardContent>
      </Card>

      {/* Progress donut */}
      <Card className="lg:col-span-1">
        <CardContent className="cc-card-pad">
          <h3 className="font-semibold mb-3">{t.courseProgress}</h3>
          {settings?.cycles ? (() => {
            const { done, total } = countCompletedTreatments(settings, moves);
            const pct = Math.max(0, Math.min(1, total ? done / total : 0));
            return (
              <div className="flex items-center gap-4">
                <DonutProgress pct={pct} />
                <div>
                  <div className="text-lg font-medium">{t.progressPct(Math.round(pct * 100))}</div>
                  <div className="text-sm opacity-70">{done}/{total} {t.cyclesCompletedSuffix}</div>
                </div>
              </div>
            );
          })() : (
            <p className="text-sm opacity-70">{t.setCyclesHint}</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardContent className="cc-card-pad">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{t.upcoming}</h3>
            {/* NEW: Quick add appointment button */}
            <QuickAddAppointment onAdded={refresh} />
          </div>
          <div className="divide-y">
            {upcoming.map(ev => (
              <div key={ev.id} className={`py-3 flex items-start justify-between ${isSameDay(ev.date, today) ? "bg-blue-50 rounded-lg px-2" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className={`cc-chip text-xs px-2 py-1 rounded-full border mt-1 ${badgeColor(ev)}`}>{labelFor(ev)}</span>
                  <div>
                    {/* ORDER: Days to go → Date → Title → Notes */}
                    <div className="text-sm font-semibold">{daysToGoText(ev.date)}</div>
                    <div className="text-xs opacity-70">{formatHuman(ev.date)}{hasTime(ev) ? ` · ${formatTime(ev.date)}` : ""}{isSameDay(ev.date, today) ? ` · ${t.today}` : ""}</div>
                    <div className={`mt-1 font-medium ${ (done as any)[ev.id] ? 'line-through opacity-60' : '' }`}>
                      {ev.type === 'treatment' ? `${t.treatment} #${ev.index + 1}` : ev.title}
                    </div>
                    {ev.type === 'action' && ev.rule?.notes ? <div className="text-xs opacity-70 mt-1 whitespace-pre-wrap">{ev.rule.notes}</div> : null}
                    {ev.type === 'oneoff' && ev.item?.notes ? <div className="text-xs opacity-70 mt-1 whitespace-pre-wrap">{ev.item.notes}</div> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!(done as any)[ev.id]}
                    aria-label={`Mark ${labelFor(ev)} as done`}
                    onClick={(e:any) => {
                      if (!(done as any)[ev.id]) { fireConfettiAtClient(e.clientX, e.clientY); }
                    }}
                    onCheckedChange={(v)=>toggleDone(ev.id, !!v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/*** Move Treatment ***/
function MoveTreatment({ settings, moves, onChanged, preselectIndex }: { settings: any; moves: any[]; onChanged: () => void; preselectIndex?: number }) {
  const { t } = useLocale();
  const [index, setIndex] = useState(preselectIndex ?? 0);
  const [newDate, setNewDate] = useState("");

  const series = useMemo(() => buildAnchors(settings.startDate, settings.frequencyDays, moves), [settings, moves]);
  const current = useMemo(() => computeTreatmentDate(series, index), [series, index]);

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3 items-end">
        <div>
          <Label>{t.treatmentOccurrence}</Label>
          <Input type="number" min={1} value={index + 1} onChange={e => setIndex(Math.max(0, (parseInt(e.target.value || "1", 10) - 1)))} />
          <div className="text-xs opacity-70 mt-1">{t.currentDate} <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 border"><CalendarIcon className="w-3 h-3" />{formatHuman(current)}</span></div>
        </div>
        <div><Label>{t.moveToDate}</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
        <div className="flex gap-2"><Button onClick={async () => {
          if (!newDate) return;
          const updated = [...moves.filter((m: any) => m.index !== index), { index, newDateISO: newDate }].sort((a: any,b: any)=>a.index-b.index);
          await saveMoves(updated); onChanged();
        }}>{t.applyMove}</Button></div>
      </div>
      <p className="text-xs opacity-70">{t.moveHelp}</p>
    </div>
  );
}

/*** Share ***/
function SharePanel() {
  const { t } = useLocale();
  const [events, setEvents] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  const [code, setCode] = useState("");
  const [calendarName, setCalendarName] = useState<string>("ChemoCare"); // NEW
  const fileRef = useRef<HTMLInputElement>(null);

  const copyCode = async () => {
    try {
      const settings = await loadSettings();
      const bundle = { v:1, settings: { ...settings, calendarName: calendarName?.trim() || settings?.calendarName || "ChemoCare" }, moves: await loadMoves() };
      const text = encodeShare(bundle);
      await navigator.clipboard.writeText(text);
      alert(t.copied);
    } catch { alert(t.importFail); }
  };
  const loadFromCode = async () => {
    try {
      const bundle = decodeShare(code.trim());
      if (!bundle?.settings) throw new Error("bad");
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves || []);
      setCalendarName(bundle.settings.calendarName || "ChemoCare");
      setEvents(buildEvents(bundle.settings, bundle.moves || [], { monthsAhead: 24 }));
      alert(t.importSuccess);
    } catch { alert(t.importFail); }
  };
  const downloadJson = async () => {
    const s = await loadSettings();
    const bundle = { v:1, settings: { ...s, calendarName: calendarName?.trim() || s?.calendarName || "ChemoCare" }, moves: await loadMoves() };
    const blob = new Blob([JSON.stringify(bundle,null,2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const nameForFile = (bundle.settings.calendarName || "ChemoCare").replace(/[^a-z0-9-_]+/gi,"_");
    a.href = url; a.download = `ChemoCare-share-${nameForFile}-${toISODate(new Date())}.json`;
    document.body.appendChild(a); a.click(); safeRemove(a); URL.revokeObjectURL(url);
  };
  const uploadJson = async (file: File) => {
    try {
      const txt = await file.text();
      const bundle = JSON.parse(txt);
      await saveSettings(bundle.settings);
      await saveMoves(bundle.moves||[]);
      setCalendarName(bundle.settings.calendarName || "ChemoCare");
      setEvents(buildEvents(bundle.settings, bundle.moves || [], { monthsAhead: 24 }));
      alert(t.importSuccess);
    } catch { alert(t.importFail); }
  };

  useEffect(() => { (async () => {
    const s = await loadSettings();
    if (s && Array.isArray(s.medRules)) {
      s.medRules = s.medRules.map((r: any) => {
        const rawDay = (typeof r.day === "number") ? r.day : (typeof r.offset === "number" ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1);
        return { ...r, day: normalizeDayInput(rawDay) };
      });
      s.oneOffs = Array.isArray(s.oneOffs) ? s.oneOffs : [];
    }
    const mv = await loadMoves();
    const evs = buildEvents(s, mv, { monthsAhead: 24 });
    setCalendarName(s?.calendarName || "ChemoCare");
    setEvents(evs); setReady(true);
  })(); }, []);

  if (!ready) return <p className="text-sm">{t.preparing}</p>;

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <p className="text-sm opacity-80" dangerouslySetInnerHTML={{ __html: t.shareBody }} />
          <div className="mt-2">
            <Label className="text-xs">{t.calendarNameLabel}</Label>
            <Input value={calendarName} onChange={(e)=>setCalendarName(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={() => {
              const ics = generateICS(events, { calendarName: calendarName?.trim() || "ChemoCare" });
              const safeName = (calendarName?.trim() || "ChemoCare").replace(/[^a-z0-9-_]+/gi,"_");
              downloadICS(ics, `ChemoCare-${safeName}-${toISODate(new Date())}.ics`);
            }}>
              <Download className="w-4 h-4 mr-2"/>{t.exportICS}
            </Button>
            {/* NEW: Export PDF */}
            <Button variant="outline" onClick={() => openPdfOfUpcoming(events, calendarName?.trim() || "ChemoCare")}>
              <FileText className="w-4 h-4 mr-2" />{t.exportPDF}
            </Button>
          </div>
          <p className="text-xs opacity-70 mt-1">{t.exportPDFDesc}</p>
        </div>

        <div>
          <h4 className="font-medium">{t.shareInApp}</h4>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyCode}>{t.copyShareCode}</Button>
            <Button variant="outline" onClick={downloadJson}>{t.downloadFile}</Button>
            <Button variant="outline" onClick={()=>document.getElementById("share-file-input")?.click()}><Upload className="w-4 h-4 mr-2" />{t.uploadFile}</Button>
            <input id="share-file-input" type="file" accept="application/json" className="hidden" onChange={e=>{ const f=(e.target as HTMLInputElement).files?.[0]; if (f) uploadJson(f); }} />
          </div>
          <div className="mt-2">
            <Label className="text-xs">{t.pasteShareCode}</Label>
            <Textarea rows={3} value={code} onChange={e=>setCode(e.target.value)} />
            <div className="mt-2">
              <Button onClick={loadFromCode}>{t.load}</Button>
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-lg border p-3 bg-white/70 backdrop-blur">
        <summary className="cursor-pointer font-medium">{t.howToImport}</summary>
        <ul className="list-disc ml-6 text-sm mt-2 space-y-1" dangerouslySetInnerHTML={{ __html: STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].outlookDesktop + STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].outlookWeb + STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].googleCal + STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].appleCal }} />
        <p className="text-xs opacity-70 mt-2">{t.subNote}</p>
      </details>
    </div>
  );
}

/*** Month Calendar ***/
function MonthCalendar({ events }: { events: any[]; }) {
  const { t } = useLocale();
  const [cursor, setCursor] = useState(new Date());
  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDay = startOfMonth.getDay();
  const gridStart = addDays(startOfMonth, -((startDay + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const eventsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ev of events) {
      const key = toISODate(ev.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const arr of map.values()) arr.sort((a: any,b: any)=> a.type === b.type ? 0 : (a.type === "treatment" ? -1 : 1));
    return map;
  }, [events]);

  const chipColor = (ev: any) => {
    if (ev.type === "treatment") return "bg-green-100";
    if (ev.type === "action") return "bg-yellow-100";
    if (ev.type === "oneoff" && ev.item?.kind === "med") return "bg-purple-100";
    if (ev.type === "oneoff" && ev.item?.kind === "appointment") return "bg-blue-100";
    return "bg-yellow-100";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}>{t.prev}</Button>
        <div className="text-lg font-semibold">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <Button variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}>{t.next}</Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {t.weekdays.map((d: string) => <div key={d} className="text-xs text-center opacity-70 py-1">{d}</div>)}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const key = toISODate(day);
          const evs = eventsByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());
          return (
            <div key={i} className={`min-h-[100px] p-2 rounded-xl border ${inMonth ? "bg-white" : "bg-gray-100 opacity-70"} ${isToday ? "ring-2 ring-blue-400" : ""}`}>
              <div className="text-xs mb-1 opacity-70">{day.getDate()}</div>
              <div className="space-y-1">
                {evs.map((ev: any) => (
                  <div key={ev.id} className={`text-[11px] px-2 py-1 rounded-full ${chipColor(ev)} flex items-center justify-between gap-1`}>
                    <span className="truncate">
                      {ev.type === 'treatment'
                        ? `${t.treatment} #${ev.index + 1}`
                        : `${ev.title}${((ev.type === "action" && ev.rule?.time) || (ev.type === "oneoff" && ev.item?.time)) ? ` · ${formatTime(ev.date)}` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/*** Plan Editor (Edit Schedule) ***/
function PlanEditor({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const { t } = useLocale();
  const [vals, setVals] = useState(() => {
    const v = structuredClone(settings);
    v.medRules = (v.medRules || []).map((r: any) => {
      const rawDay = (typeof r.day === "number") ? r.day : (typeof r.offset === "number" ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1);
      return { time: "", ...r, day: normalizeDayInput(rawDay) };
    });
    v.oneOffs = Array.isArray(v.oneOffs) ? v.oneOffs : [];
    v.calendarName = v.calendarName || "ChemoCare";
    return v;
  });
  const [dirty, setDirty] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  const update = (patch: any) => { setVals((v: any) => ({ ...v, ...patch })); setDirty(true); };
  const updateRule = (id: string, patch: any) => { setVals((v: any) => ({ ...v, medRules: v.medRules.map((r: any) => r.id === id ? { ...r, ...patch, day: normalizeDayInput(patch.day ?? r.day) } : r) })); setDirty(true); };
  const addRule = () => update({ medRules: [...vals.medRules, { id: crypto.randomUUID(), day: 1, title: "Day 1: action", notes: "", time: "", enabled: true }] });
  const deleteRule = (id: string) => update({ medRules: vals.medRules.filter((r: any) => r.id !== id) });
  const duplicateRule = (rule: any) => update({ medRules: [...vals.medRules, { ...rule, id: crypto.randomUUID() }] });

  const addOneOff = (kind: "appointment" | "med") =>
    update({ oneOffs: [...(vals.oneOffs || []), { id: crypto.randomUUID(), dateISO: "", time: "", title: "", notes: "", kind }] });
  const updateOneOff = (id: string, patch: any) =>
    update({ oneOffs: (vals.oneOffs || []).map((o:any)=>o.id===id?{...o, ...patch}:o) });
  const deleteOneOff = (id: string) =>
    update({ oneOffs: (vals.oneOffs || []).filter((o:any)=>o.id!==id) });

  const showSaved = () => { setSavedFlag(true); setTimeout(()=>setSavedFlag(false), 2200); };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div><Label>{t.firstDate}</Label><Input type="date" value={vals.startDate} onChange={e => update({ startDate: e.target.value })} /></div>
        <div><Label>{t.frequency}</Label><Input type="number" step={1} min={1} value={vals.frequencyDays} onChange={e => update({ frequencyDays: parseInt(e.target.value || "0", 10) })} /></div>
        <div><Label>{t.cycles}</Label><Input type="number" step={1} min={1} value={vals.cycles ?? ""} onChange={e => update({ cycles: e.target.value === "" ? null : parseInt(e.target.value, 10) })} /></div>
      </div>

      <div>
        <Label>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].calendarNameLabel}</Label>
        <Input value={vals.calendarName} onChange={(e)=>update({ calendarName: e.target.value })} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">{t.medActions}</h4>
          <p className="text-xs opacity-70">{t.medActionsHelp}</p>
        </div>
        {/* FIX: Add Action button placed with actions (not near one-offs) */}
        <Button variant="outline" onClick={() => addRule()}><Plus className="w-4 h-4 mr-2"/>{t.addAction}</Button>
      </div>

      <div className="space-y-2">
        {vals.medRules.map((rule: any) => (
          <div key={rule.id} className="cc-rule-row p-3">
            <div>
              <div className="flex items-center gap-1"><Label className="text-xs">{t.dayField}</Label><DayInfo t={t} /></div>
              <DayInput value={rule.day} onChange={(n)=>updateRule(rule.id, { day: n })} />
            </div>
            <div><Label className="text-xs">{t.timeOfDay}</Label><Input type="time" value={rule.time || ""} onChange={e => updateRule(rule.id, { time: e.target.value })} /></div>
            <div><Label className="text-xs">{t.title}</Label><Input value={rule.title} onChange={e => updateRule(rule.id, { title: e.target.value })} /></div>
            <div><Label className="text-xs">{t.notes}</Label><Textarea rows={2} value={rule.notes || ""} onChange={e => updateRule(rule.id, { notes: e.target.value })} /></div>
            <div className="cc-controls flex items-center gap-2">
              <Checkbox checked={rule.enabled} onCheckedChange={v => updateRule(rule.id, { enabled: !!v })} />
              <Button size="icon" variant="ghost" onClick={() => duplicateRule(rule)} title={t.duplicateAction}><Copy className="w-4 h-4"/></Button>
              <Button size="icon" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="w-4 h-4"/></Button>
            </div>
          </div>
        ))}
      </div>

      <h4 className="font-medium mt-6">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].oneOffsTitle}</h4>
      <p className="text-xs opacity-70">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].oneOffsHelp}</p>
      <div className="space-y-2">
        {(vals.oneOffs || []).map((o:any) => (
          <div key={o.id} className="cc-rule-row p-3">
            <div>
              <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].date}</Label>
              <Input type="date" value={o.dateISO} onChange={e=>updateOneOff(o.id,{dateISO:e.target.value})}/>
            </div>
            <div>
              <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].timeOfDay}</Label>
              <Input type="time" value={o.time||""} onChange={e=>updateOneOff(o.id,{time:e.target.value})}/>
            </div>
            <div>
              <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].title}</Label>
              <Input value={o.title} onChange={e=>updateOneOff(o.id,{title:e.target.value})}/>
            </div>
            <div>
              <Label className="text-xs">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].notes}</Label>
              <Textarea rows={2} value={o.notes||""} onChange={e=>updateOneOff(o.id,{notes:e.target.value})}/>
            </div>
            <div className="cc-controls flex items-center gap-2">
              <Select value={o.kind} onValueChange={(v)=>updateOneOff(o.id,{kind:v})}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder={STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].type}/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].appointment}</SelectItem>
                  <SelectItem value="med">{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].medication}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={()=>deleteOneOff(o.id)}><Trash2 className="w-4 h-4"/></Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>addOneOff("appointment")}><Plus className="w-4 h-4 mr-2"/>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].addAppointment}</Button>
          <Button variant="outline" onClick={()=>addOneOff("med")}><Plus className="w-4 h-4 mr-2"/>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].addMedication}</Button>
        </div>
      </div>

      <div className="flex">
        <div className="flex-1" />
        <Button disabled={!dirty} onClick={async () => {
          const oldSettings = await loadSettings();
          const oldMoves = await loadMoves();
          if (oldSettings) {
            const series = buildAnchors(oldSettings.startDate, oldSettings.frequencyDays, oldMoves);
            const cutoff = new Date();
            const frozen = freezePastMoves(series, cutoff, oldSettings.cycles ?? null);
            const merged = mergeMoves(oldMoves, frozen);
            await saveMoves(merged);
          }
          await saveSettings({ ...vals, medRules: vals.medRules.map((r: any)=>({ ...r, day: normalizeDayInput(r.day) })), oneOffs: vals.oneOffs || [] });
          onSaved();
          showSaved();
          setDirty(false);
        }}>{STRINGS[(localStorage.getItem("locale") as LocaleKey) || "nl"].savePlan}</Button>
      </div>

      {savedFlag && (
        <div className="cc-toast">
          <div className="px-3 py-2 rounded-lg border bg-green-50 text-green-800 border-green-200 shadow-sm">{t.saved}</div>
        </div>
      )}
    </div>
  );
}


/******************** DOM runtime guards ********************/
function installDomGuardsOnce(){
  if ((window as any).__CHEMOCARE_DOM_GUARDS__) return;
  (window as any).__CHEMOCARE_DOM_GUARDS__ = true;
  try {
    const origRemoveChild = Node.prototype.removeChild;
    // @ts-ignore
    Node.prototype.removeChild = function(child: any){
      try { return origRemoveChild.call(this, child); }
      catch (e:any) {
        if (e && (e.name === "NotFoundError" || String(e).includes("NotFoundError"))) {
          // ignore benign double-removals
          return child;
        }
        throw e;
      }
    };
  } catch {}
  try {
    const origRemove = (Element.prototype as any).remove;
    if (origRemove) {
      // @ts-ignore
      Element.prototype.remove = function(){
        try { return origRemove.call(this); }
        catch (e:any) {
          if (e && (e.name === "NotFoundError" || String(e).includes("NotFoundError"))) return;
          throw e;
        }
      };
    }
  } catch {}
}

/*** App ***/
installDomGuardsOnce();
type AppMode = 'loading' | 'wizard' | 'main';
function App() {
  const { t } = useLocale();
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AppMode>('loading');
  const [settings, setSettings] = useState<any>(null);
  const [moves, setMoves] = useState<any[]>([]);

  const refresh = async () => {
    const s = await loadSettings();
    if (s && Array.isArray(s.medRules)) {
      s.medRules = s.medRules.map((r: any) => {
        const rawDay = (typeof r.day === "number") ? r.day
          : (typeof r.offset === "number") ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1;
        return { ...r, day: normalizeDayInput(rawDay) };
      });
      s.oneOffs = Array.isArray(s.oneOffs) ? s.oneOffs : [];
      s.calendarName = s.calendarName || "ChemoCare";
    }
    const mv = await loadMoves();
    setSettings(s);
    setMoves(mv);
    setLoaded(true);
    setMode(s ? 'main' : 'wizard');
  };

  useEffect(() => { refresh(); }, []);
  if (!loaded) return (
    <div className="cc-app-shell">
      <div className="cc-container">
        <Header onReset={async () => { await saveSettings(null); await saveMoves([]); refresh(); }} />
        <GlobalStyles />
        <Card><CardContent className="cc-card-pad">Loading…</CardContent></Card>
      </div>
    </div>
  );

  if (mode === 'wizard') {
    return (
      <FirstLaunchWizard
        onDone={() => refresh()}
        onReset={async () => { await saveSettings(null); await saveMoves([]); refresh(); }}
      />
    );
  }

  const events = buildEvents(settings, moves, { monthsAhead: 18 });

  return (
    <div className="cc-app-shell">
      <div className="cc-container">
        <Header onReset={async () => { await saveSettings(null); await saveMoves([]); refresh(); }} />
        <GlobalStyles />
        <div className="space-y-4">
          <div className="cc-tabs">
            <Tabs defaultValue="home" className="w-full">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="home">{t.tabs.home}</TabsTrigger>
                <TabsTrigger value="calendar">{t.tabs.calendar}</TabsTrigger>
                <TabsTrigger value="plan">{t.tabs.plan}</TabsTrigger>
                <TabsTrigger value="share">{t.tabs.share}</TabsTrigger>
              </TabsList>
              <TabsContent value="home"><motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}><Home settings={settings} moves={moves} refresh={refresh} /></motion.div></TabsContent>
              <TabsContent value="calendar"><motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
                {/* NEW: Toolbar with quick add */}
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-semibold">{t.tabs.calendar}</div>
                  <QuickAddAppointment onAdded={refresh} />
                </div>
                <MonthCalendar events={events} />
              </motion.div></TabsContent>
              <TabsContent value="plan"><motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}><Card><CardContent className="cc-card-pad"><PlanEditor settings={settings} onSaved={refresh} /></CardContent></Card></motion.div></TabsContent>
              <TabsContent value="share"><motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}><Card><CardContent className="cc-card-pad"><SharePanel /></CardContent></Card></motion.div></TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}



/*** Error Boundary ***/
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; err?: any }> {
  constructor(props:any){ super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(error:any){ return { hasError: true, err: error }; }
  componentDidCatch(error:any, info:any){ console.error("ErrorBoundary caught:", error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="p-4 rounded-xl border bg-red-50 text-red-900">
          <div className="font-semibold mb-1">Something went wrong.</div>
          <pre className="text-xs whitespace-pre-wrap">{String(this.state.err)}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}


// Safe mount (guard against calling createRoot twice on the same container)
declare global { interface Window { __CHEMOCARE_ROOT__?: any; } }
if (typeof document !== "undefined") {
  const el = document.getElementById("root");
  if (el) {
    try {
      const root = (window as any).__CHEMOCARE_ROOT__ ?? createRoot(el);
      (window as any).__CHEMOCARE_ROOT__ = root;
      root.render(<ErrorBoundary><App /></ErrorBoundary>);
    } catch (e) {
      console.error("Mount error:", e);
    }
  }
}

export default App;
