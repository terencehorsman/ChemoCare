import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Download, Edit, Share2, Plus, Trash2, MoveRight } from "lucide-react";
import { motion } from "framer-motion";
import { openDB } from "idb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRoot } from "react-dom/client";

/**
 * ChemoCare – Offline-first web app for chemotherapy scheduling
 * - No backend. Uses IndexedDB for persistence.
 * - Configurable treatment plan: first date + frequency (days).
 * - Configurable medication/task offsets relative to treatment Day 0 (treatment day). Negatives allowed (e.g., -1).
 * - Auto-builds recurring treatment appointments and per-cycle actions.
 * - Moving one treatment shifts all subsequent cycles by the frequency.
 * - Home shows days until next action/treatment + upcoming chronological feed (highlights Today).
 * - Calendar month view + ability to move a treatment occurrence.
 * - Share: export .ics file for import to Outlook/Gmail/Apple Calendar (offline-friendly). See notes in UI re: live subscriptions.
 */

/******************** Utilities ********************/
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; // reserved for future use

function toISODate(d: Date) {
  // YYYY-MM-DD in local time
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dt.toISOString().slice(0, 10);
}

function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a: Date, b: Date) {
  // whole-day difference from a to b (b - a)
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function formatHuman(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function formatOffsetLabel(offset: number) {
  return offset > 0 ? "+" + offset : String(offset); // 0 -> "0", positives with +
}

/******************** IndexedDB ********************/
const DB_NAME = "chemo-care-db";
const DB_VERSION = 2;
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

async function saveSettings(settings: any) {
  const db = await getDB();
  await db.put("settings", settings, "settings");
}

async function loadSettings() {
  const db = await getDB();
  return (await db.get("settings", "settings")) || null;
}

async function saveMoves(moves: any[]) {
  const db = await getDB();
  await db.put("moves", moves, "moves");
}

async function loadMoves() {
  const db = await getDB();
  return (await db.get("moves", "moves")) || [] as any[];
}

async function saveDone(done: Record<string, boolean>) {
  const db = await getDB();
  await db.put("done", done, "done");
}

async function loadDone() {
  const db = await getDB();
  return (await db.get("done", "done")) || {} as Record<string, boolean>;
}

/******************** i18n (minimal) ********************/
// NOTE: This is a tiny stopgap. Replace with react-i18next later.
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
    setupHelp: "Treatment day is <b>Day 0</b>. Use negatives for days before treatment (e.g., <b>-1</b>), <b>0</b> means the treatment day, and <b>+1</b> means the day after.",
    firstDate: "First treatment date",
    frequency: "Frequency (days)",
    cycles: "Number of cycles (optional)",
    medActions: "Medication & actions per cycle",
    offsetHelpBtn: "Offset help",
    offsetHelpTitle: "What does offset mean?",
    offsetExpl: "<p><b>Offset</b> is relative to the treatment day (<b>Day 0</b>).</p>",
    offsetM1: "<li><b>-1</b> = day before</li>",
    offset0: "<li><b>0</b> = treatment day</li>",
    offsetP1: "<li><b>+1</b> = day after</li>",
    offsetDays: "Offset (days)",
    title: "Title",
    notesOpt: "Notes (optional)",
    notes: "Notes",
    addAction: "Add action",
    savePlan: "Save plan",
    nextAction: "Next action",
    dueToday: "Due today",
    daysWord: "day(s)",
    overdue: "overdue",
    toGo: "to go",
    nextTreatment: "Next treatment",
    today: "Today",
    quickActions: "Quick actions",
    editPlan: "Edit plan",
    moveTreatment: "Move treatment…",
    moveATreatment: "Move a treatment",
    upcoming: "Upcoming (next 12)",
    treatment: "Treatment",
    action: "Action",
    moveEllipsis: "Move…",
    treatmentOccurrence: "Treatment occurrence",
    currentDate: "Current date:",
    moveToDate: "Move to date",
    applyMove: "Apply move",
    moveHelp: "This will shift this treatment to the new date. All subsequent treatments will follow at your set frequency from this new date.",
    preparing: "Preparing…",
    shareBody: "Because this app is fully offline with no server, live subscription (webcal://) isn’t possible. Instead, export an <code>.ics</code> file and import it to Outlook, Google Calendar, or Apple Calendar. If you later make changes, just export a new file and re-import (most calendars merge updates).",
    exportICS: "Export .ics",
    howToImport: "How to import",
    outlookDesktop: "<li><b>Outlook (desktop)</b>: File → Open & Export → Import/Export → Import iCalendar (.ics) → Choose the file.</li>",
    outlookWeb: "<li><b>Outlook (web)</b>: Calendar → Add calendar → Upload from file → Choose the file.</li>",
    googleCal: "<li><b>Google Calendar</b>: Settings → Import & export → Import → Select file → Choose destination calendar.</li>",
    appleCal: "<li><b>Apple Calendar</b>: File → Import → Choose the file.</li>",
    subNote: "If you prefer true subscription updates, we can add a tiny server later to host a private webcal feed.",
    tabs: { home: "Home", calendar: "Calendar", plan: "Plan", share: "Share" },
    weekdays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    prev: "Prev", next: "Next",
    editAffects: "Editing the plan now only affects <b>today and future</b> cycles. Past cycles are locked to their original dates.",
    cycleWord: (n:number)=>`Cycle ${n}`,
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
    setupHelp: "De behandelingsdag is <b>Dag 0</b>. Gebruik negatieve waarden voor dagen vóór de behandeling (bijv. <b>-1</b>), <b>0</b> is de dag van behandeling en <b>+1</b> is de dag erna.",
    firstDate: "Eerste behandelingsdatum",
    frequency: "Frequentie (dagen)",
    cycles: "Aantal cycli (optioneel)",
    medActions: "Medicatie & acties per cyclus",
    offsetHelpBtn: "Hulp bij verschuiving",
    offsetHelpTitle: "Wat betekent verschuiving?",
    offsetExpl: "<p><b>Verschuiving</b> is relatief ten opzichte van de behandelingsdag (<b>Dag 0</b>).</p>",
    offsetM1: "<li><b>-1</b> = dag ervoor</li>",
    offset0: "<li><b>0</b> = dag van behandeling</li>",
    offsetP1: "<li><b>+1</b> = dag erna</li>",
    offsetDays: "Verschuiving (dagen)",
    title: "Titel",
    notesOpt: "Notities (optioneel)",
    notes: "Notities",
    addAction: "Actie toevoegen",
    savePlan: "Plan opslaan",
    nextAction: "Volgende actie",
    dueToday: "Vandaag",
    daysWord: "dag(en)",
    overdue: "te laat",
    toGo: "te gaan",
    nextTreatment: "Volgende behandeling",
    today: "Vandaag",
    quickActions: "Snelle acties",
    editPlan: "Plan bewerken",
    moveTreatment: "Behandeling verplaatsen…",
    moveATreatment: "Een behandeling verplaatsen",
    upcoming: "Aankomend (volgende 12)",
    treatment: "Behandeling",
    action: "Actie",
    moveEllipsis: "Verplaatsen…",
    treatmentOccurrence: "Behandelingsnummer",
    currentDate: "Huidige datum:",
    moveToDate: "Verplaatsen naar datum",
    applyMove: "Verplaatsing toepassen",
    moveHelp: "Dit verplaatst deze behandeling naar de nieuwe datum. Alle volgende behandelingen volgen daarna op jouw ingestelde frequentie.",
    preparing: "Voorbereiden…",
    shareBody: "Omdat deze app volledig offline is zonder server, is een live-abonnement (webcal://) niet mogelijk. Exporteer in plaats daarvan een <code>.ics</code>-bestand en importeer dit in Outlook, Google Agenda of Apple Agenda. Maak je later wijzigingen? Exporteer dan opnieuw en importeer opnieuw (de meeste agenda's voegen updates samen).",
    exportICS: "Exporteer .ics",
    howToImport: "Importeren",
    outlookDesktop: "<li><b>Outlook (desktop)</b>: Bestand → Openen & Exporteren → Importeren/Exporteren → iCalendar (.ics) importeren → Kies het bestand.</li>",
    outlookWeb: "<li><b>Outlook (web)</b>: Agenda → Agenda toevoegen → Uploaden vanaf bestand → Kies het bestand.</li>",
    googleCal: "<li><b>Google Agenda</b>: Instellingen → Importeren & exporteren → Importeren → Selecteer bestand → Kies doelagenda.</li>",
    appleCal: "<li><b>Apple Agenda</b>: Archief → Importeer → Kies het bestand.</li>",
    subNote: "Als je echte abonnement-updates wilt, kunnen we later een kleine server toevoegen om een privé webcal-feed te hosten.",
    tabs: { home: "Start", calendar: "Kalender", plan: "Plan", share: "Delen" },
    weekdays: ["Ma","Di","Wo","Do","Vr","Za","Zo"],
    prev: "Vorige", next: "Volgende",
    editAffects: "Het bewerken van het plan heeft nu alleen effect op <b>vandaag en toekomstige</b> cycli. Eerdere cycli blijven op hun oorspronkelijke datums vastgezet.",
    cycleWord: (n:number)=>`Cyclus ${n}`,
  }
} as const;

type LocaleKey = keyof typeof STRINGS; // 'en' | 'nl'

function useLocale() {
  const [locale, setLocale] = useState<LocaleKey>((localStorage.getItem("locale") as LocaleKey) || "en");
  const t = STRINGS[locale];
  const changeLocale = (value: LocaleKey) => {
    setLocale(value);
    localStorage.setItem("locale", value);
    try { window.dispatchEvent(new CustomEvent("locale:changed", { detail: { locale: value } })); } catch {}
  };
  useEffect(() => {
    const h = () => setLocale((localStorage.getItem("locale") as LocaleKey) || "en");
    window.addEventListener("locale:changed", h);
    return () => window.removeEventListener("locale:changed", h);
  }, []);
  return { locale, t, changeLocale } as const;
}

/******************** Domain Model ********************/
/**
 * settings = {
 *   startDate: "YYYY-MM-DD",   // Date of first treatment (Day 0)
 *   frequencyDays: number,      // e.g., 14 or 21 or 28
 *   cycles: number | null,      // optional cap on number of cycles (null for open-ended)
 *   medRules: Array<{ id: string, offset: number, title: string, notes?: string, enabled: boolean }>
 * }
 *
 * moves: Array<{ index: number, newDateISO: string }>
 * - Moving occurrence j fixes its date to newDate and uses that as the new anchor for j+1 onward in steps of frequencyDays.
 */

type Series = { anchors: { index: number; date: Date }[]; frequencyDays: number };

function buildAnchors(startDateISO: string, frequencyDays: number, moves: { index: number; newDateISO: string }[]): Series {
  // Anchors are the set of (index, date) where a treatment date is explicitly fixed by start or a move.
  const anchors = [{ index: 0, date: parseISODate(startDateISO) }];
  const sorted = [...moves].sort((a, b) => a.index - b.index);
  for (const m of sorted) {
    anchors.push({ index: m.index, date: parseISODate(m.newDateISO) });
  }
  anchors.sort((a, b) => a.index - b.index);
  // Collapse duplicates keeping the latest entry if same index appears twice
  const dedup: { index: number; date: Date }[] = [];
  for (const a of anchors) {
    const last = dedup[dedup.length - 1];
    if (!last || last.index !== a.index) dedup.push(a); else dedup[dedup.length - 1] = a;
  }
  return { anchors: dedup, frequencyDays };
}

function computeTreatmentDate(series: Series, occurrenceIndex: number) {
  const { anchors, frequencyDays } = series;
  // find the anchor with the greatest index <= occurrenceIndex
  let anchor = anchors[0];
  for (const a of anchors) {
    if (a.index <= occurrenceIndex) anchor = a; else break;
  }
  const delta = occurrenceIndex - anchor.index;
  return addDays(anchor.date, delta * frequencyDays);
}

function* iterateTreatments(series: Series, { fromDate, toDate, maxCount = 1000, cyclesCap = null }: { fromDate?: Date; toDate?: Date; maxCount?: number; cyclesCap?: number | null } = {}) {
  // Generate treatment occurrences within a window.
  // Determine a reasonable start index: search around the nearest cycle by difference in days / frequency.
  const first = computeTreatmentDate(series, 0);
  // If fromDate given, estimate index
  let startIndex = 0;
  if (fromDate) {
    const est = Math.floor(diffDays(first, fromDate) / series.frequencyDays);
    startIndex = clamp(est - 3, 0, 100000);
  }
  let count = 0;
  for (let i = startIndex; i < startIndex + maxCount; i++) {
    if (cyclesCap != null && i >= cyclesCap) break;
    const d = computeTreatmentDate(series, i);
    if (toDate && d > toDate) break;
    if (fromDate && d < fromDate) continue;
    yield { index: i, date: d } as { index: number; date: Date };
    count++;
    if (count >= maxCount) break;
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
    // Treatment event (Day 0)
    events.push({
      id: `treat-${index}`,
      type: "treatment",
      title: `Treatment #${index + 1}`,
      date,
      index,
    });
    // Medication/action rules relative to Day 0
    for (const rule of settings.medRules || []) {
      if (!rule.enabled && rule.enabled !== undefined) continue;
      const actionDate = addDays(date, rule.offset); // Day 0 = treatment day
      events.push({
        id: `act-${index}-${rule.id}`,
        type: "action",
        title: rule.title || `Action (Day ${formatOffsetLabel(rule.offset)})`,
        date: actionDate,
        index,
        rule,
      });
    }
  }

  // Sort chronologically
  events.sort((a, b) => a.date - b.date || (a.type === "treatment" ? -1 : 1));
  return events;
}

/******************** Plan freeze helpers ********************/
function mergeMoves(base: { index: number; newDateISO: string }[], add: { index: number; newDateISO: string }[]) {
  const m = new Map<number, string>();
  for (const b of base) m.set(b.index, b.newDateISO);
  for (const a of add) m.set(a.index, a.newDateISO);
  return Array.from(m.entries()).map(([index, newDateISO]) => ({ index, newDateISO })).sort((x, y) => x.index - y.index);
}

function freezePastMoves(series: Series, cutoffDate: Date, cyclesCap: number | null) {
  const frozen: { index: number; newDateISO: string }[] = [];
  const max = 1000;
  for (let i = 0; i < max; i++) {
    if (cyclesCap != null && i >= cyclesCap) break;
    const d = computeTreatmentDate(series, i);
    if (d <= cutoffDate) {
      frozen.push({ index: i, newDateISO: toISODate(d) });
    } else {
      break;
    }
  }
  return frozen;
}

function daysUntil(date: Date) {
  const today = new Date();
  return diffDays(today, date);
}

/******************** ICS Export ********************/
function pad(n: number) { return n.toString().padStart(2, "0"); }
function toICSDate(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

function generateICS(events: any[], { calendarName = "ChemoCare" } = {}) {
  const t = STRINGS[(localStorage.getItem("locale") as LocaleKey) || "en"];
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChemoCare//EN",
    `X-WR-CALNAME:${calendarName}`,
  ];
  for (const ev of events) {
    const dtStart = toICSDate(ev.date);
    const dtEnd   = toICSDate(addDays(ev.date, 1)); // all-day events end next day
    const uid     = `${ev.id}@chemocare.local`;
    const title   = ev.type === "treatment" ? `${t.treatment} #${ev.index + 1}` : `${ev.title}`;
    const desc    = ev.type === "treatment" ? t.cycleWord(ev.index + 1) : (ev.rule?.notes || "");
    const stamp   = `${toICSDate(new Date())}T000000Z`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${(desc || "").replace(/\n/g, "\\n")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(content: string, filename = "chemocare.ics") {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/******************** UI Components ********************/
function OffsetInfo({ t }: { t: any }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label={t.offsetHelpBtn} className="inline-flex items-center justify-center align-middle w-5 h-5 rounded-full border text-[10px] leading-none ml-1 hover:bg-gray-100" title={t.offsetHelpTitle}>?</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        <div dangerouslySetInnerHTML={{ __html: t.offsetExpl }} />
        <ul className="list-disc ml-4 mt-2 space-y-1" dangerouslySetInnerHTML={{ __html: t.offsetM1 + t.offset0 + t.offsetP1 }} />
      </PopoverContent>
    </Popover>
  );
}

function Header({ onReset }: { onReset: () => void }) {
  const { locale, t, changeLocale } = useLocale();
  return (
    <div className="w-full flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="text-2xl font-bold">{t.appName}</h1>
      </div>
      <div className="flex gap-2 items-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline"><Share2 className="w-4 h-4 mr-2"/>{t.shareExport}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.shareTitle}</DialogTitle>
            </DialogHeader>
            <SharePanel />
          </DialogContent>
        </Dialog>
        <Select value={locale} onValueChange={(v)=>changeLocale(v as LocaleKey)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t.language} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t.english}</SelectItem>
            <SelectItem value="nl">{t.dutch}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={onReset}><Trash2 className="w-4 h-4 mr-2"/>{t.reset}</Button>
      </div>
    </div>
  );
}

function SetupWizard({ onComplete }: { onComplete: (settings: any) => void }) {
  const { t } = useLocale();
  const [startDate, setStartDate] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(21);
  const [cycles, setCycles] = useState<any>(6);
  const [medRules, setMedRules] = useState([
    { id: crypto.randomUUID(), offset: -1, title: "Day -1: Pre-med XYZ", notes: "", enabled: true },
    { id: crypto.randomUUID(), offset: 1, title: "Day +1: Post-med XYZ", notes: "", enabled: true },
  ]);

  const addRule = () => setMedRules(r => [...r, { id: crypto.randomUUID(), offset: 0, title: "Action", notes: "", enabled: true }]);
  const updateRule = (id: string, patch: any) => setMedRules(r => r.map(x => x.id === id ? { ...x, ...patch } : x));
  const deleteRule = (id: string) => setMedRules(r => r.filter(x => x.id !== id));

  const canSave = startDate && frequencyDays >= 1;

  return (
    <Card className="max-w-3xl mx-auto">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold mb-2">{t.setupTitle}</h2>
        <p className="text-sm opacity-80 mb-4" dangerouslySetInnerHTML={{ __html: t.setupHelp }} />

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div>
            <Label>{t.firstDate}</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>{t.frequency}</Label>
            <Input type="number" step={1} min={1} value={frequencyDays} onChange={e => setFrequencyDays(parseInt(e.target.value || "0", 10))} />
          </div>
          <div>
            <Label>{t.cycles}</Label>
            <Input type="number" step={1} min={1} value={cycles} onChange={e => setCycles(e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
          </div>
        </div>

        <h3 className="font-medium mb-2">{t.medActions}</h3>
        <div className="space-y-2 mb-4">
          {medRules.map(rule => (
            <div key={rule.id} className="grid md:grid-cols-12 items-center gap-2 p-2 rounded-lg border">
              <div className="md:col-span-2">
                <div className="flex items-center gap-1"><Label className="text-xs">{t.offsetDays}</Label><OffsetInfo t={t} /></div>
                <Input
                  type="number"
                  step={1}
                  value={rule.offset}
                  onChange={e => updateRule(rule.id, { offset: parseInt(e.target.value || "0", 10) })}
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">{t.title}</Label>
                <Input value={rule.title} onChange={e => updateRule(rule.id, { title: e.target.value })} />
              </div>
              <div className="md:col-span-6">
                <Label className="text-xs">{t.notesOpt}</Label>
                <Input value={rule.notes} onChange={e => updateRule(rule.id, { notes: e.target.value })} />
              </div>
              <div className="md:col-span-1 flex items-center gap-2">
                <Checkbox checked={rule.enabled} onCheckedChange={v => updateRule(rule.id, { enabled: !!v })} />
                <Button size="icon" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="w-4 h-4"/></Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          <Button variant="outline" onClick={addRule}><Plus className="w-4 h-4 mr-2"/>{t.addAction}</Button>
        </div>

        <div className="flex justify-end">
          <Button disabled={!canSave} onClick={async () => {
            const settings = {
              startDate: startDate,
              frequencyDays: frequencyDays,
              cycles: cycles === "" ? null : cycles,
              medRules: medRules.map(m => ({ ...m })),
            };
            await saveSettings(settings);
            await saveMoves([]);
            onComplete(settings);
          }}>{t.savePlan}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

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

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">{t.nextAction}</h3>
          {nextActionEv ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border ${isSameDay(nextActionEv.date, today) ? "bg-yellow-50" : "bg-gray-50"}`}>
              <div className="text-sm opacity-70">{isSameDay(nextActionEv.date, today) ? t.dueToday : `${Math.abs(daysUntil(nextActionEv.date))} ${t.daysWord} ${daysUntil(nextActionEv.date) < 0 ? t.overdue : t.toGo}`}</div>
              <div className="text-lg font-medium">{nextActionEv.title}</div>
              {nextActionEv.rule?.notes ? (<div className="text-xs opacity-70 mt-1">{nextActionEv.rule.notes}</div>) : null}
              <div className="text-sm opacity-80">{formatHuman(nextActionEv.date)}</div>
            </motion.div>
          ) : <p className="opacity-70">-</p>}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">{t.nextTreatment}</h3>
          {nextTreatmentEv ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border ${isSameDay(nextTreatmentEv.date, today) ? "bg-green-50" : "bg-gray-50"}`}>
              <div className="text-sm opacity-70">{isSameDay(nextTreatmentEv.date, today) ? t.today : `${daysUntil(nextTreatmentEv.date)} ${t.daysWord}`}</div>
              <div className="text-lg font-medium">{`${t.treatment} #${nextTreatmentEv.index + 1}`}</div>
              <div className="text-sm opacity-80">{formatHuman(nextTreatmentEv.date)}</div>
            </motion.div>
          ) : <p className="opacity-70">-</p>}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">{t.quickActions}</h3>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline"><Edit className="w-4 h-4 mr-2"/>{t.editPlan}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{t.editPlan}</DialogTitle>
                </DialogHeader>
                <PlanEditor settings={settings} onSaved={refresh} />
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline"><MoveRight className="w-4 h-4 mr-2"/>{t.moveTreatment}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.moveATreatment}</DialogTitle>
                </DialogHeader>
                <MoveTreatment settings={settings} moves={moves} onChanged={refresh} />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">{t.upcoming}</h3>
          <div className="divide-y">
            {upcoming.map(ev => (
              <div key={ev.id} className={`py-2 flex items-center justify-between ${isSameDay(ev.date, today) ? "bg-blue-50 rounded-lg px-2" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full border ${ev.type === "treatment" ? "bg-green-100" : "bg-yellow-100"}`}>{ev.type === "treatment" ? t.treatment : t.action}</span>
                  <div>
                    <div className={`font-medium ${ev.type === 'action' && done[ev.id] ? 'line-through opacity-60' : ''}`}>
                      {ev.type === 'treatment' ? `${t.treatment} #${ev.index + 1}` : ev.title}
                    </div>
                    <div className="text-xs opacity-70">{formatHuman(ev.date)}{isSameDay(ev.date, today) ? ` · ${t.today}` : ""}</div>
                    {ev.type === 'action' && ev.rule?.notes ? <div className="text-xs opacity-70 mt-1">{ev.rule.notes}</div> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ev.type === 'action' && (
                    <Checkbox checked={!!done[ev.id]} onCheckedChange={(v)=>toggleDone(ev.id, !!v)} />
                  )}
                  {ev.type === "treatment" && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">{t.moveEllipsis}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{`${t.moveEllipsis.replace("…", "")} ${t.treatment} #${ev.index + 1}`}</DialogTitle>
                        </DialogHeader>
                        <MoveTreatment preselectIndex={ev.index} settings={settings} moves={moves} onChanged={refresh} />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanEditor({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const { t } = useLocale();
  const [vals, setVals] = useState(structuredClone(settings));
  const [dirty, setDirty] = useState(false);

  const update = (patch: any) => { setVals((v: any) => ({ ...v, ...patch })); setDirty(true); };
  const updateRule = (id: string, patch: any) => { setVals((v: any) => ({ ...v, medRules: v.medRules.map((r: any) => r.id === id ? { ...r, ...patch } : r) })); setDirty(true); };
  const addRule = () => update({ medRules: [...vals.medRules, { id: crypto.randomUUID(), offset: 0, title: "Action", notes: "", enabled: true }] });
  const deleteRule = (id: string) => update({ medRules: vals.medRules.filter((r: any) => r.id !== id) });

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>{t.firstDate}</Label>
          <Input type="date" value={vals.startDate} onChange={e => update({ startDate: e.target.value })} />
        </div>
        <div>
          <Label>{t.frequency}</Label>
          <Input type="number" step={1} min={1} value={vals.frequencyDays} onChange={e => update({ frequencyDays: parseInt(e.target.value || "0", 10) })} />
        </div>
        <div>
          <Label>{t.cycles}</Label>
          <Input type="number" step={1} min={1} value={vals.cycles ?? ""} onChange={e => update({ cycles: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
        </div>
      </div>

      <h4 className="font-medium">{t.medActions}</h4>
      <div className="space-y-2">
        {vals.medRules.map((rule: any) => (
          <div key={rule.id} className="grid md:grid-cols-12 items-center gap-2 p-2 rounded-lg border">
            <div className="md:col-span-2">
              <div className="flex items-center gap-1"><Label className="text-xs">{t.offsetDays}</Label><OffsetInfo t={t} /></div>
              <Input type="number" step={1} value={rule.offset} onChange={e => updateRule(rule.id, { offset: parseInt(e.target.value || "0", 10) })} />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">{t.title}</Label>
              <Input value={rule.title} onChange={e => updateRule(rule.id, { title: e.target.value })} />
            </div>
            <div className="md:col-span-6">
              <Label className="text-xs">{t.notes}</Label>
              <Input value={rule.notes} onChange={e => updateRule(rule.id, { notes: e.target.value })} />
            </div>
            <div className="md:col-span-1 flex items-center gap-2">
              <Checkbox checked={rule.enabled} onCheckedChange={v => updateRule(rule.id, { enabled: !!v })} />
              <Button size="icon" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="w-4 h-4"/></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => addRule()}><Plus className="w-4 h-4 mr-2"/>{t.addAction}</Button>
        <div className="flex-1" />
        <Button disabled={!dirty} onClick={async () => {
          // Freeze all past & today treatments using the CURRENT schedule so editing only affects future
          const oldSettings = await loadSettings();
          const oldMoves = await loadMoves();
          if (oldSettings) {
            const series = buildAnchors(oldSettings.startDate, oldSettings.frequencyDays, oldMoves);
            const cutoff = new Date();
            const frozen = freezePastMoves(series, cutoff, oldSettings.cycles ?? null);
            const merged = mergeMoves(oldMoves, frozen);
            await saveMoves(merged);
          }
          await saveSettings(vals);
          onSaved();
        }}>{t.savePlan}</Button>
      </div>
      <p className="text-xs opacity-70" dangerouslySetInnerHTML={{ __html: t.editAffects }} />
    </div>
  );
}

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
        <div>
          <Label>{t.moveToDate}</Label>
          <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={async () => {
            if (!newDate) return;
            const updated = [...moves.filter((m: any) => m.index !== index), { index, newDateISO: newDate }].sort((a: any,b: any)=>a.index-b.index);
            await saveMoves(updated);
            onChanged();
          }}>{t.applyMove}</Button>
        </div>
      </div>
      <p className="text-xs opacity-70">{t.moveHelp}</p>
    </div>
  );
}

function SharePanel() {
  const { t } = useLocale();
  const [events, setEvents] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { (async () => {
    const s = await loadSettings();
    const mv = await loadMoves();
    const evs = buildEvents(s, mv, { monthsAhead: 24 });
    setEvents(evs);
    setReady(true);
  })(); }, []);

  if (!ready) return <p className="text-sm">{t.preparing}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-80" dangerouslySetInnerHTML={{ __html: t.shareBody }} />
      <div className="flex gap-2">
        <Button onClick={() => {
          const ics = generateICS(events, { calendarName: "ChemoCare" });
          downloadICS(ics, `ChemoCare-${toISODate(new Date())}.ics`);
        }}>
          <Download className="w-4 h-4 mr-2"/>{t.exportICS}
        </Button>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">{t.howToImport}</summary>
        <ul className="list-disc ml-6 text-sm mt-2 space-y-1" dangerouslySetInnerHTML={{ __html: t.outlookDesktop + t.outlookWeb + t.googleCal + t.appleCal }} />
        <p className="text-xs opacity-70 mt-2">{t.subNote}</p>
      </details>
    </div>
  );
}

function MonthCalendar({ events, onMoveTreatment }: { events: any[]; onMoveTreatment: (ev: any) => void }) {
  const { t } = useLocale();
  const [cursor, setCursor] = useState(new Date());

  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDay = startOfMonth.getDay(); // 0 Sun ... 6 Sat
  const gridStart = addDays(startOfMonth, -((startDay + 6) % 7)); // start Monday
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
            <div key={i} className={`min-h-[88px] p-2 rounded-xl border ${inMonth ? "bg-white" : "bg-gray-100 opacity-70"} ${isToday ? "ring-2 ring-blue-400" : ""}`}>
              <div className="text-xs mb-1 opacity-70">{day.getDate()}</div>
              <div className="space-y-1">
                {evs.map((ev: any) => (
                  <div key={ev.id} className={`text-[11px] px-2 py-1 rounded-full ${ev.type === "treatment" ? "bg-green-100" : "bg-yellow-100"} flex items-center justify-between gap-1`}>
                    <span className="truncate">{ev.type === 'treatment' ? `${t.treatment} #${ev.index + 1}` : ev.title}</span>
                    {ev.type === "treatment" && (
                      <button className="text-[10px] underline" onClick={() => onMoveTreatment(ev)}>{t.moveEllipsis}</button>
                    )}
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

function App() {
  const { t } = useLocale();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [moves, setMoves] = useState<any[]>([]);

  const refresh = async () => {
    const s = await loadSettings();
    const mv = await loadMoves();
    setSettings(s);
    setMoves(mv);
    setLoaded(true);
  };

  useEffect(() => { refresh(); }, []);

  if (!loaded) return <div className="p-6">Loading…</div>;

  if (!settings) {
    return (
      <div className="max-w-5xl mx-auto p-4 min-h-screen bg-gray-50 text-gray-900">
        <Header onReset={async () => { await saveSettings(null); await saveMoves([]); refresh(); }} />
        <SetupWizard onComplete={() => refresh()} />
      </div>
    );
  }

  const events = buildEvents(settings, moves, { monthsAhead: 18 });

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4 min-h-screen bg-gray-50 text-gray-900">
      <Header onReset={async () => { await saveSettings(null); await saveMoves([]); refresh(); }} />
      <Tabs defaultValue="home">
        <TabsList>
          <TabsTrigger value="home">{t.tabs.home}</TabsTrigger>
          <TabsTrigger value="calendar">{t.tabs.calendar}</TabsTrigger>
          <TabsTrigger value="plan">{t.tabs.plan}</TabsTrigger>
          <TabsTrigger value="share">{t.tabs.share}</TabsTrigger>
        </TabsList>
        <TabsContent value="home">
          <Home settings={settings} moves={moves} refresh={refresh} />
        </TabsContent>
        <TabsContent value="calendar">
          <MonthCalendar
            events={events}
            onMoveTreatment={(ev) => {
              const dlg = document.getElementById("moveTreatmentDialogBtn");
              if (dlg) (dlg as HTMLButtonElement).click();
              setTimeout(() => setMoveContext(ev), 0);
            }}
          />
          <Dialog>
            <DialogTrigger asChild>
              <button id="moveTreatmentDialogBtn" style={{ display: "none" }} />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{`${STRINGS[(localStorage.getItem("locale") as LocaleKey) || "en"].moveEllipsis.replace("…", "")} ${t.treatment}`}</DialogTitle>
              </DialogHeader>
              <MoveTreatment preselectIndex={moveContext?.index || 0} settings={settings} moves={moves} onChanged={refresh} />
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="plan">
          <PlanEditor settings={settings} onSaved={refresh} />
        </TabsContent>
        <TabsContent value="share">
          <SharePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// local state holder for calendar dialog
let moveContext: any = null;
function setMoveContext(ev: any) { moveContext = ev; }

export default App;

/******************** Lightweight runtime tests (run in dev) ********************/
function assertEq(name: string, a: any, b: any) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.warn(`❌ ${name} failed`, { a, b });
  } else {
    console.log(`✅ ${name} passed`);
  }
}

function runLightTests() {
  try {
    const start = "2025-01-01";
    const s = buildAnchors(start, 14, []);
    // Treatment #1 should be start (Day 0)
    assertEq("T1", toISODate(computeTreatmentDate(s, 0)), "2025-01-01");
    // Treatment #2 should be +14 days
    assertEq("T2", toISODate(computeTreatmentDate(s, 1)), "2025-01-15");

    const settings = {
      startDate: start,
      frequencyDays: 14,
      cycles: 6,
      medRules: [
        { id: "pre", offset: -1, title: "Pre-med", enabled: true }, // Day -1
        { id: "post", offset: 1, title: "Post-med", enabled: true }, // Day +1
        { id: "same", offset: 0, title: "On-day med", enabled: true }, // Day 0
      ],
    };
    const evs = buildEvents(settings, [], { monthsAhead: 2 });
    const firstTreatment = evs.find((e: any) => e.id === "treat-0");
    const firstPre = evs.find((e: any) => e.id === "act-0-pre");
    const firstPost = evs.find((e: any) => e.id === "act-0-post");
    const firstSame = evs.find((e: any) => e.id === "act-0-same");
    assertEq("First treatment date", toISODate(firstTreatment.date), "2025-01-01");
    assertEq("Pre-med day -1", toISODate(firstPre.date), "2024-12-31");
    assertEq("Post-med day +1", toISODate(firstPost.date), "2025-01-02");
    assertEq("On-day action Day 0", toISODate(firstSame.date), "2025-01-01");

    // Freeze all past up to Jan 20, then change frequency and ensure past dates are unchanged
    const seriesBefore = buildAnchors(settings.startDate, settings.frequencyDays, []);
    const frozen = freezePastMoves(seriesBefore, new Date("2025-01-20"), settings.cycles);
    const movesMerged = mergeMoves([], frozen);
    const afterChangeSeries = buildAnchors(settings.startDate, 21, movesMerged); // change to q3w
    // Index 0 and 1 occur on Jan 1 and Jan 15, should remain the same after change
    assertEq("Frozen #1 stays", toISODate(computeTreatmentDate(afterChangeSeries, 0)), "2025-01-01");
    assertEq("Frozen #2 stays", toISODate(computeTreatmentDate(afterChangeSeries, 1)), "2025-01-15");
    // Index 2 should now be 21 days after Jan 15 = Feb 5
    assertEq("Future shifts from last frozen", toISODate(computeTreatmentDate(afterChangeSeries, 2)), "2025-02-05");

    // Move treatment #2 to 2025-01-20; #3 should be 14 days after that
    const moved = buildAnchors(start, 14, [{ index: 1, newDateISO: "2025-01-20" }]);
    assertEq("Moved #2", toISODate(computeTreatmentDate(moved, 1)), "2025-01-20");
    assertEq("Shifted #3", toISODate(computeTreatmentDate(moved, 2)), "2025-02-03");

    // i18n smoke tests
    localStorage.setItem("locale", "nl");
    const nlT = STRINGS[(localStorage.getItem("locale") as LocaleKey) || "en"]; 
    assertEq("Cycle label NL", nlT.cycleWord(2), "Cyclus 2");
    // ICS localisation
    const sampleEvents = [
      { id: "treat-0", type: "treatment", title: "Treatment #1", date: new Date("2025-01-01"), index: 0 },
    ];
    const ics = generateICS(sampleEvents);
    assertEq("ICS has Dutch 'Behandeling'", /SUMMARY:Behandeling #1/.test(ics), true);
    localStorage.setItem("locale", "en");

  } catch (err) {
    console.warn("Tests encountered an error", err);
  }
}

if (typeof window !== "undefined") {
  // Run tests in dev-ish environments
  try { runLightTests(); } catch {}
}

// Mount when running directly in an index.html preview
if (typeof document !== "undefined" && document.getElementById("root")) {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}


