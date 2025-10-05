import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Download, Edit, Share2, Plus, Trash2, MoveRight, Copy, Menu as MenuIcon } from "lucide-react";
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
 * - Hospital day counting only: Day 1 = treatment day, Day -1 = day before, Day 2 = day after. Day 0 is invalid.
 * - No backend. Uses IndexedDB for persistence.
 * - Configurable treatment plan: first date + frequency (days).
 * - Actions use a "day indicator" relative to treatment day (…,-1,1,2,…). Day 0 is blocked.
 * - Optional time per action; if set, creates timed event in .ics; otherwise all-day.
 * - Moving one treatment shifts all subsequent cycles by the frequency.
 * - Home shows days until next action/treatment + upcoming feed.
 * - Calendar month view + ability to move a treatment occurrence.
 * - Share: export .ics file for Outlook/Gmail/Apple.
 */
/******************** Utilities ********************/
function toISODate(d) { const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return dt.toISOString().slice(0, 10); }
function parseISODate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function diffDays(a, b) { const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate()); const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate()); return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)); }
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function pad(n) { return n.toString().padStart(2, "0"); }
function formatHuman(d) { return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function formatTime(d) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function applyTime(date, hhmm) { if (!hhmm)
    return date; const [h, m] = hhmm.split(":").map(Number); const withTime = new Date(date); withTime.setHours(h || 0, m || 0, 0, 0); return withTime; }
// --- Day helpers: treatment is Day 1 ---
// UI "day indicator" -> offset relative to treatment (Day 1 -> 0, Day 2 -> +1, Day -1 -> -1)
function dayToOffset(day) { return day >= 1 ? day - 1 : day; }
// Normalize any user input; disallow Day 0 (snaps to Day 1)
function normalizeDayInput(raw) {
    const n = Number.isFinite(raw) ? raw : parseInt(String(raw ?? ""), 10);
    if (isNaN(n))
        return 1;
    return n === 0 ? 1 : n;
}
// Mobile detection
function useIsMobile(bp = 768) {
    const [m, setM] = useState(() => typeof window !== "undefined" ? window.innerWidth < bp : false);
    useEffect(() => { const onR = () => setM(window.innerWidth < bp); window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR); }, [bp]);
    return m;
}
/******************** IndexedDB ********************/
const DB_NAME = "chemo-care-db";
const DB_VERSION = 8; // add-action button restore + confetti + DayInput improvements
let dbPromise;
async function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains("settings"))
                    db.createObjectStore("settings");
                if (!db.objectStoreNames.contains("moves"))
                    db.createObjectStore("moves");
                if (!db.objectStoreNames.contains("done"))
                    db.createObjectStore("done");
            },
        });
    }
    return dbPromise;
}
async function saveSettings(settings) { const db = await getDB(); await db.put("settings", settings, "settings"); }
async function loadSettings() { const db = await getDB(); return (await db.get("settings", "settings")) || null; }
async function saveMoves(moves) { const db = await getDB(); await db.put("moves", moves, "moves"); }
async function loadMoves() { const db = await getDB(); return (await db.get("moves", "moves")) || []; }
async function saveDone(done) { const db = await getDB(); await db.put("done", done, "done"); }
async function loadDone() { const db = await getDB(); return (await db.get("done", "done")) || {}; }
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
        medActions: "Medication & actions per cycle",
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
        moveHelp: "This shifts the chosen treatment to the new date; later ones follow your set frequency.",
        preparing: "Preparing…",
        exportICS: "Export .ics",
        shareBody: "Offline app: export an <code>.ics</code> and import into Outlook/Google/Apple. Re-export if you change the plan.",
        howToImport: "How to import",
        outlookDesktop: "<li><b>Outlook (desktop)</b>: File → Open & Export → Import/Export → Import iCalendar (.ics) → Choose the file.</li>",
        outlookWeb: "<li><b>Outlook (web)</b>: Calendar → Add calendar → Upload from file → Choose the file.</li>",
        googleCal: "<li><b>Google Calendar</b>: Settings → Import & export → Import → Select file → Choose destination calendar.</li>",
        appleCal: "<li><b>Apple Calendar</b>: File → Import → Choose the file.</li>",
        subNote: "For live subscription (webcal://), a tiny server can be added later.",
        tabs: { home: "Home", calendar: "Calendar", plan: "Plan", share: "Share" },
        weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        prev: "Prev", next: "Next",
        editAffects: "Editing the plan now only affects <b>today and future</b> cycles; past cycles stay fixed.",
        cycleWord: (n) => `Cycle ${n}`,
        sameDayHint: "Tip: for multiple meds on one day, add multiple actions with the same day.",
        menu: "Menu",
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
        medActions: "Medicatie & acties per cyclus",
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
        moveHelp: "Dit verplaatst de gekozen behandeling; volgende behandelingen volgen de ingestelde frequentie.",
        preparing: "Voorbereiden…",
        exportICS: "Exporteer .ics",
        shareBody: "Offline app: exporteer een <code>.ics</code> en importeer in Outlook/Google/Apple. Exporteer opnieuw bij wijzigingen.",
        howToImport: "Importeren",
        outlookDesktop: "<li><b>Outlook (desktop)</b>: Bestand → Openen & Exporteren → Importeren/Exporteren → iCalendar (.ics) importeren → Kies het bestand.</li>",
        outlookWeb: "<li><b>Outlook (web)</b>: Agenda → Agenda toevoegen → Uploaden vanaf bestand → Kies het bestand.</li>",
        googleCal: "<li><b>Google Agenda</b>: Instellingen → Importeren & exporteren → Importeren → Selecteer bestand → Kies doelagenda.</li>",
        appleCal: "<li><b>Apple Agenda</b>: Archief → Importeer → Kies het bestand.</li>",
        subNote: "Wil je live updates (webcal://)? Later kan een kleine server dit hosten.",
        tabs: { home: "Start", calendar: "Kalender", plan: "Plan", share: "Delen" },
        weekdays: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
        prev: "Vorige", next: "Volgende",
        editAffects: "Nu bewerken heeft alleen effect op <b>vandaag en toekomstige</b> cycli; eerdere cycli blijven vastgezet.",
        cycleWord: (n) => `Cyclus ${n}`,
        sameDayHint: "Tip: meerdere medicijnen op één dag? Voeg meerdere acties met dezelfde dag toe.",
        menu: "Menu",
    }
};
function useLocale() {
    const [locale, setLocale] = useState(localStorage.getItem("locale") || "nl");
    const t = STRINGS[locale];
    const changeLocale = (value) => { setLocale(value); localStorage.setItem("locale", value); try {
        window.dispatchEvent(new CustomEvent("locale:changed", { detail: { locale: value } }));
    }
    catch { } };
    useEffect(() => { const h = () => setLocale(localStorage.getItem("locale") || "nl"); window.addEventListener("locale:changed", h); return () => window.removeEventListener("locale:changed", h); }, []);
    return { locale, t, changeLocale };
}
function buildAnchors(startDateISO, frequencyDays, moves) {
    const anchors = [{ index: 0, date: parseISODate(startDateISO) }];
    const sorted = [...moves].sort((a, b) => a.index - b.index);
    for (const m of sorted)
        anchors.push({ index: m.index, date: parseISODate(m.newDateISO) });
    anchors.sort((a, b) => a.index - b.index);
    const dedup = [];
    for (const a of anchors) {
        const last = dedup[dedup.length - 1];
        if (!last || last.index !== a.index)
            dedup.push(a);
        else
            dedup[dedup.length - 1] = a;
    }
    return { anchors: dedup, frequencyDays };
}
function computeTreatmentDate(series, occurrenceIndex) {
    const { anchors, frequencyDays } = series;
    let anchor = anchors[0];
    for (const a of anchors) {
        if (a.index <= occurrenceIndex)
            anchor = a;
        else
            break;
    }
    const delta = occurrenceIndex - anchor.index;
    return addDays(anchor.date, delta * frequencyDays);
}
function* iterateTreatments(series, { fromDate, toDate, maxCount = 1000, cyclesCap = null } = {}) {
    const first = computeTreatmentDate(series, 0);
    let startIndex = 0;
    if (fromDate) {
        const est = Math.floor(diffDays(first, fromDate) / series.frequencyDays);
        startIndex = Math.max(0, est - 3);
    }
    let count = 0;
    for (let i = startIndex; i < startIndex + maxCount; i++) {
        if (cyclesCap != null && i >= cyclesCap)
            break;
        const d = computeTreatmentDate(series, i);
        if (toDate && d > toDate)
            break;
        if (fromDate && d < fromDate)
            continue;
        yield { index: i, date: d };
        count++;
        if (count >= maxCount)
            break;
    }
}
function buildEvents(settings, moves, { monthsAhead = 12 } = {}) {
    if (!settings)
        return [];
    const now = new Date();
    const windowStart = addDays(new Date(now.getFullYear(), now.getMonth(), 1), -7);
    const windowEnd = addDays(new Date(now.getFullYear(), now.getMonth(), 1), monthsAhead * 31);
    const series = buildAnchors(settings.startDate, settings.frequencyDays, moves);
    const events = [];
    for (const { index, date } of iterateTreatments(series, { fromDate: windowStart, toDate: windowEnd, cyclesCap: settings.cycles ?? null })) {
        // Treatment (Day 1)
        events.push({ id: `treat-${index}`, type: "treatment", title: `Treatment #${index + 1}`, date, index });
        // Actions
        for (const rule of settings.medRules || []) {
            if (!rule.enabled && rule.enabled !== undefined)
                continue;
            const offset = dayToOffset(rule.day); // day -> offset
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
    events.sort((a, b) => a.date - b.date || (a.type === "treatment" ? -1 : 1));
    return events;
}
/******************** Plan freeze helpers ********************/
function mergeMoves(base, add) {
    const m = new Map();
    for (const b of base)
        m.set(b.index, b.newDateISO);
    for (const a of add)
        m.set(a.index, a.newDateISO);
    return Array.from(m.entries()).map(([index, newDateISO]) => ({ index, newDateISO })).sort((x, y) => x.index - y.index);
}
function freezePastMoves(series, cutoffDate, cyclesCap) {
    const frozen = [];
    const max = 1000;
    for (let i = 0; i < max; i++) {
        if (cyclesCap != null && i >= cyclesCap)
            break;
        const d = computeTreatmentDate(series, i);
        if (d <= cutoffDate)
            frozen.push({ index: i, newDateISO: toISODate(d) });
        else
            break;
    }
    return frozen;
}
function daysUntil(date) { const today = new Date(); return diffDays(today, date); }
/******************** ICS Export ********************/
function toICSDate(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
function toICSTime(d) { return `${pad(d.getHours())}${pad(d.getMinutes())}00`; }
function generateICS(events, { calendarName = "ChemoCare" } = {}) {
    const t = STRINGS[localStorage.getItem("locale") || "nl"];
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ChemoCare//EN", `X-WR-CALNAME:${calendarName}`];
    for (const ev of events) {
        const uid = `${ev.id}@chemocare.local`;
        const title = ev.type === "treatment" ? `${t.treatment} #${ev.index + 1}` : `${ev.title}`;
        const desc = ev.type === "treatment" ? t.cycleWord(ev.index + 1) : (ev.rule?.notes || "");
        const stamp = `${toICSDate(new Date())}T000000Z`;
        if (ev.type === "action" && ev.rule?.time) {
            const dt = ev.date;
            const start = `${toICSDate(dt)}T${toICSTime(dt)}`;
            const endDt = new Date(dt.getTime() + 60 * 60 * 1000); // 1h
            const end = `${toICSDate(endDt)}T${toICSTime(endDt)}`;
            lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${title}`, `DESCRIPTION:${(desc || "").replace(/\n/g, "\\n")}`, "END:VEVENT");
        }
        else {
            const dtStart = toICSDate(ev.date);
            const dtEnd = toICSDate(addDays(ev.date, 1));
            lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dtStart}`, `DTEND;VALUE=DATE:${dtEnd}`, `SUMMARY:${title}`, `DESCRIPTION:${(desc || "").replace(/\n/g, "\\n")}`, "END:VEVENT");
        }
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
}
function downloadICS(content, filename = "chemocare.ics") {
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
/******************** UI Bits ********************/
function DayInfo({ t }) {
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx("button", { "aria-label": t.dayHelpBtn, className: "inline-flex items-center justify-center align-middle w-5 h-5 rounded-full border text-[10px] leading-none ml-1 hover:bg-gray-100", title: t.dayHelpTitle, children: "?" }) }), _jsx(PopoverContent, { className: "w-64 text-sm", children: _jsx("div", { dangerouslySetInnerHTML: { __html: t.dayExpl } }) })] }));
}
/** DayInput: number field that *skips 0* but allows editing to "", "-" and then "-1" **/
function DayInput({ value, onChange }) {
    const [text, setText] = useState(String(value));
    // sync external changes unless user is mid-entry "" or "-"
    useEffect(() => {
        const vstr = String(value);
        if (text !== vstr && text !== "" && text !== "-")
            setText(vstr);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    const handleChange = (e) => {
        let v = e.target.value;
        if (v === "0" || v === "-0")
            v = "1"; // never let raw 0 exist
        setText(v);
        const n = Number(v);
        if (!Number.isNaN(n) && n !== 0)
            onChange(n);
    };
    const commit = () => {
        const n = Number(text);
        const normalized = (!Number.isNaN(n) ? (n === 0 ? 1 : n) : 1);
        setText(String(normalized));
        onChange(normalized);
    };
    return (_jsx(Input, { type: "text", inputMode: "numeric", pattern: "-?[0-9]*", value: text, onChange: handleChange, onBlur: commit, onWheel: (e) => {
            if (document.activeElement === e.currentTarget) {
                e.preventDefault();
                const cur = Number.isNaN(Number(text)) ? value : Number(text) || 1;
                let next = e.deltaY < 0 ? cur + 1 : cur - 1;
                if (next === 0)
                    next += e.deltaY < 0 ? 1 : -1;
                setText(String(next));
                onChange(next);
            }
        }, onKeyDown: (e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const cur = Number.isNaN(Number(text)) ? value : Number(text) || 1;
                let next = e.key === "ArrowUp" ? cur + 1 : cur - 1;
                if (next === 0)
                    next += e.key === "ArrowUp" ? 1 : -1;
                setText(String(next));
                onChange(next);
            }
            if (e.key === "Enter") {
                e.preventDefault();
                commit();
            }
        } }));
}
function fireConfettiAtClient(clientX, clientY) {
    try {
        const x = clientX != null ? clientX / window.innerWidth : 0.5;
        const y = clientY != null ? clientY / window.innerHeight : 0.35;
        confetti({
            particleCount: 90,
            spread: 65,
            startVelocity: 40,
            gravity: 0.9,
            scalar: 1,
            ticks: 160,
            origin: { x, y },
        });
    }
    catch { }
}
/*** Header (desktop: buttons, mobile: collapsed menu) ***/
function Header({ onReset }) {
    const { locale, t, changeLocale } = useLocale();
    const mobile = useIsMobile();
    return (_jsxs("div", { className: "w-full flex items-center justify-between mb-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(CalendarIcon, { className: "w-6 h-6" }), _jsx("h1", { className: "text-2xl font-bold", children: t.appName })] }), !mobile ? (_jsxs("div", { className: "flex gap-2 items-center", children: [_jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", children: [_jsx(Share2, { className: "w-4 h-4 mr-2" }), t.shareExport] }) }), _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: t.shareTitle }) }), _jsx(SharePanel, {})] })] }), _jsxs(Select, { value: locale, onValueChange: (v) => changeLocale(v), children: [_jsx(SelectTrigger, { className: "w-[120px]", children: _jsx(SelectValue, { placeholder: t.language }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "en", children: t.english }), _jsx(SelectItem, { value: "nl", children: t.dutch })] })] }), _jsxs(Button, { variant: "secondary", onClick: onReset, children: [_jsx(Trash2, { className: "w-4 h-4 mr-2" }), t.reset] })] })) : (_jsxs(Sheet, { children: [_jsx(SheetTrigger, { asChild: true, children: _jsx(Button, { variant: "outline", size: "icon", "aria-label": t.menu, children: _jsx(MenuIcon, { className: "w-5 h-5" }) }) }), _jsxs(SheetContent, { side: "bottom", className: "h-[80vh] overflow-auto", children: [_jsx(SheetHeader, { children: _jsx(SheetTitle, { children: t.menu }) }), _jsxs("div", { className: "mt-4 space-y-6", children: [_jsxs("section", { className: "space-y-3", children: [_jsx("h3", { className: "font-medium", children: t.shareTitle }), _jsx(SharePanel, {})] }), _jsxs("section", { className: "space-y-2", children: [_jsx("h3", { className: "font-medium", children: t.language }), _jsxs(Select, { value: locale, onValueChange: (v) => changeLocale(v), children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "en", children: t.english }), _jsx(SelectItem, { value: "nl", children: t.dutch })] })] })] }), _jsxs("section", { className: "space-y-2", children: [_jsx("h3", { className: "font-medium", children: "Reset" }), _jsxs(Button, { variant: "secondary", onClick: onReset, className: "w-full", children: [_jsx(Trash2, { className: "w-4 h-4 mr-2" }), t.reset] })] })] })] })] }))] }));
}
/*** Setup Wizard ***/
function SetupWizard({ onComplete }) {
    const { t } = useLocale();
    const [startDate, setStartDate] = useState("");
    const [frequencyDays, setFrequencyDays] = useState(21);
    const [cycles, setCycles] = useState(6);
    const [medRules, setMedRules] = useState([
        { id: crypto.randomUUID(), day: -1, title: "Dag -1: premedicatie", notes: "", time: "", enabled: true },
        { id: crypto.randomUUID(), day: 2, title: "Dag 2: nabehandeling", notes: "", time: "", enabled: true },
    ]);
    const addRule = () => setMedRules(r => [...r, { id: crypto.randomUUID(), day: 1, title: "Dag 1: actie", notes: "", time: "", enabled: true }]);
    const updateRule = (id, patch) => setMedRules(r => r.map(x => x.id === id ? { ...x, ...patch, day: normalizeDayInput(patch.day ?? x.day) } : x));
    const deleteRule = (id) => setMedRules(r => r.filter(x => x.id !== id));
    const duplicateRule = (rule) => setMedRules(r => [...r, { ...rule, id: crypto.randomUUID() }]);
    const canSave = startDate && frequencyDays >= 1;
    return (_jsx(Card, { className: "max-w-3xl mx-auto", children: _jsxs(CardContent, { className: "p-6", children: [_jsx("h2", { className: "text-xl font-semibold mb-2", children: t.setupTitle }), _jsx("p", { className: "text-sm opacity-80 mb-4", dangerouslySetInnerHTML: { __html: t.setupHelp } }), _jsxs("div", { className: "grid md:grid-cols-3 gap-4 mb-6", children: [_jsxs("div", { children: [_jsx(Label, { children: t.firstDate }), _jsx(Input, { type: "date", value: startDate, onChange: e => setStartDate(e.target.value) })] }), _jsxs("div", { children: [_jsx(Label, { children: t.frequency }), _jsx(Input, { type: "number", step: 1, min: 1, value: frequencyDays, onChange: e => setFrequencyDays(parseInt(e.target.value || "0", 10)) })] }), _jsxs("div", { children: [_jsx(Label, { children: t.cycles }), _jsx(Input, { type: "number", step: 1, min: 1, value: cycles, onChange: e => setCycles(e.target.value === "" ? "" : parseInt(e.target.value, 10)) })] })] }), _jsx("h3", { className: "font-medium mb-2", children: t.medActions }), _jsx("p", { className: "text-xs opacity-70 mb-2", children: t.sameDayHint }), _jsx("div", { className: "space-y-2 mb-4", children: medRules.map(rule => (_jsxs("div", { className: "grid md:grid-cols-12 items-start gap-2 p-3 rounded-xl border bg-white", children: [_jsxs("div", { className: "md:col-span-2", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Label, { className: "text-xs", children: t.dayField }), _jsx(DayInfo, { t: t })] }), _jsx(DayInput, { value: rule.day, onChange: (n) => updateRule(rule.id, { day: n }) })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx(Label, { className: "text-xs", children: t.timeOfDay }), _jsx(Input, { type: "time", value: rule.time || "", onChange: e => updateRule(rule.id, { time: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-3", children: [_jsx(Label, { className: "text-xs", children: t.title }), _jsx(Input, { value: rule.title, onChange: e => updateRule(rule.id, { title: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-4", children: [_jsx(Label, { className: "text-xs", children: t.notesOpt }), _jsx(Textarea, { rows: 2, value: rule.notes, onChange: e => updateRule(rule.id, { notes: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-1 flex items-center gap-2 pt-5", children: [_jsx(Checkbox, { checked: rule.enabled, onCheckedChange: v => updateRule(rule.id, { enabled: !!v }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => duplicateRule(rule), title: t.duplicateAction, children: _jsx(Copy, { className: "w-4 h-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => deleteRule(rule.id), children: _jsx(Trash2, { className: "w-4 h-4" }) })] })] }, rule.id))) }), _jsxs("div", { className: "flex justify-between mb-2", children: [_jsxs(Button, { variant: "outline", onClick: addRule, children: [_jsx(Plus, { className: "w-4 h-4 mr-2" }), t.addAction] }), _jsx("div", {})] }), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { disabled: !canSave, onClick: async () => {
                            const settings = {
                                startDate,
                                frequencyDays,
                                cycles: cycles === "" ? null : cycles,
                                medRules: medRules.map(m => ({ ...m, day: normalizeDayInput(m.day) })), // enforce no 0
                            };
                            await saveSettings(settings);
                            await saveMoves([]);
                            onComplete(settings);
                        }, children: t.savePlan }) })] }) }));
}
/*** Home ***/
function Home({ settings, moves, refresh }) {
    const { t } = useLocale();
    const events = useMemo(() => buildEvents(settings, moves, { monthsAhead: 18 }), [settings, moves]);
    const today = new Date();
    const nextActionEv = events.find(ev => ev.type === "action" && diffDays(today, ev.date) >= 0);
    const nextTreatmentEv = events.find(ev => ev.type === "treatment" && diffDays(today, ev.date) >= 0);
    const [done, setDone] = useState({});
    useEffect(() => { (async () => setDone(await loadDone()))(); }, [settings, moves]);
    const toggleDone = async (id, val) => {
        const d = { ...done, [id]: val };
        await saveDone(d);
        setDone(d);
    };
    const upcoming = events.filter(ev => diffDays(today, ev.date) >= 0).slice(0, 12);
    return (_jsxs("div", { className: "grid lg:grid-cols-3 gap-4", children: [_jsx(Card, { className: "lg:col-span-1", children: _jsxs(CardContent, { className: "p-6", children: [_jsx("h3", { className: "font-semibold mb-3", children: t.nextAction }), nextActionEv ? (_jsxs(motion.div, { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, className: `p-4 rounded-2xl border ${isSameDay(nextActionEv.date, today) ? "bg-yellow-50" : "bg-gray-50"}`, children: [_jsx("div", { className: "text-sm opacity-70", children: isSameDay(nextActionEv.date, today) ? t.dueToday :
                                        `${Math.abs(daysUntil(nextActionEv.date))} ${t.daysWord} ${daysUntil(nextActionEv.date) < 0 ? t.overdue : t.toGo}` }), _jsx("div", { className: "text-lg font-medium", children: nextActionEv.title }), nextActionEv.rule?.notes ? (_jsx("div", { className: "text-xs opacity-70 mt-1 whitespace-pre-wrap", children: nextActionEv.rule.notes })) : null, _jsxs("div", { className: "text-sm opacity-80", children: [formatHuman(nextActionEv.date), nextActionEv.rule?.time ? ` · ${formatTime(nextActionEv.date)}` : ""] })] })) : _jsx("p", { className: "opacity-70", children: "-" })] }) }), _jsx(Card, { className: "lg:col-span-1", children: _jsxs(CardContent, { className: "p-6", children: [_jsx("h3", { className: "font-semibold mb-3", children: t.nextTreatment }), nextTreatmentEv ? (_jsxs(motion.div, { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, className: `p-4 rounded-2xl border ${isSameDay(nextTreatmentEv.date, today) ? "bg-green-50" : "bg-gray-50"}`, children: [_jsx("div", { className: "text-sm opacity-70", children: isSameDay(nextTreatmentEv.date, today) ? t.today : `${daysUntil(nextTreatmentEv.date)} ${t.daysWord}` }), _jsx("div", { className: "text-lg font-medium", children: `${t.treatment} #${nextTreatmentEv.index + 1}` }), _jsx("div", { className: "text-sm opacity-80", children: formatHuman(nextTreatmentEv.date) })] })) : _jsx("p", { className: "opacity-70", children: "-" })] }) }), _jsx(Card, { className: "lg:col-span-1", children: _jsxs(CardContent, { className: "p-6", children: [_jsx("h3", { className: "font-semibold mb-3", children: t.quickActions }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", children: [_jsx(Edit, { className: "w-4 h-4 mr-2" }), t.editPlan] }) }), _jsxs(DialogContent, { className: "max-w-3xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: t.editPlan }) }), _jsx(PlanEditor, { settings: settings, onSaved: refresh })] })] }), _jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", children: [_jsx(MoveRight, { className: "w-4 h-4 mr-2" }), t.moveTreatment] }) }), _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: t.moveATreatment }) }), _jsx(MoveTreatment, { settings: settings, moves: moves, onChanged: refresh })] })] })] })] }) }), _jsx(Card, { className: "lg:col-span-3", children: _jsxs(CardContent, { className: "p-6", children: [_jsx("h3", { className: "font-semibold mb-3", children: t.upcoming }), _jsx("div", { className: "divide-y", children: upcoming.map(ev => (_jsxs("div", { className: `py-2 flex items-center justify-between ${isSameDay(ev.date, today) ? "bg-blue-50 rounded-lg px-2" : ""}`, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: `text-xs px-2 py-1 rounded-full border ${ev.type === "treatment" ? "bg-green-100" : "bg-yellow-100"}`, children: ev.type === "treatment" ? t.treatment : t.action }), _jsxs("div", { children: [_jsx("div", { className: `font-medium ${ev.type === 'action' && done[ev.id] ? 'line-through opacity-60' : ''}`, children: ev.type === 'treatment' ? `${t.treatment} #${ev.index + 1}` : ev.title }), _jsxs("div", { className: "text-xs opacity-70", children: [formatHuman(ev.date), ev.type === "action" && ev.rule?.time ? ` · ${formatTime(ev.date)}` : "", isSameDay(ev.date, today) ? ` · ${t.today}` : ""] }), ev.type === 'action' && ev.rule?.notes ? _jsx("div", { className: "text-xs opacity-70 mt-1 whitespace-pre-wrap", children: ev.rule.notes }) : null] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [ev.type === 'action' && (_jsx(_Fragment, { children: _jsx(Checkbox, { checked: !!done[ev.id], onClick: (e) => {
                                                        if (!done[ev.id]) {
                                                            fireConfettiAtClient(e.clientX, e.clientY);
                                                        }
                                                    }, onCheckedChange: (v) => toggleDone(ev.id, !!v) }) })), ev.type === "treatment" && (_jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsx(Button, { size: "sm", variant: "outline", children: t.moveEllipsis }) }), _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: `${t.moveEllipsis.replace("…", "")} ${t.treatment} #${ev.index + 1}` }) }), _jsx(MoveTreatment, { preselectIndex: ev.index, settings: settings, moves: moves, onChanged: refresh })] })] }))] })] }, ev.id))) })] }) })] }));
}
/*** Plan Editor ***/
function PlanEditor({ settings, onSaved }) {
    const { t } = useLocale();
    const [vals, setVals] = useState(() => {
        // migrate legacy offset -> day, and fix any Day 0
        const v = structuredClone(settings);
        v.medRules = (v.medRules || []).map((r) => {
            const rawDay = (typeof r.day === "number") ? r.day : (typeof r.offset === "number" ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1);
            return { time: "", ...r, day: normalizeDayInput(rawDay) };
        });
        return v;
    });
    const [dirty, setDirty] = useState(false);
    const update = (patch) => { setVals((v) => ({ ...v, ...patch })); setDirty(true); };
    const updateRule = (id, patch) => { setVals((v) => ({ ...v, medRules: v.medRules.map((r) => r.id === id ? { ...r, ...patch, day: normalizeDayInput(patch.day ?? r.day) } : r) })); setDirty(true); };
    const addRule = () => update({ medRules: [...vals.medRules, { id: crypto.randomUUID(), day: 1, title: "Dag 1: actie", notes: "", time: "", enabled: true }] });
    const deleteRule = (id) => update({ medRules: vals.medRules.filter((r) => r.id !== id) });
    const duplicateRule = (rule) => update({ medRules: [...vals.medRules, { ...rule, id: crypto.randomUUID() }] });
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid md:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx(Label, { children: t.firstDate }), _jsx(Input, { type: "date", value: vals.startDate, onChange: e => update({ startDate: e.target.value }) })] }), _jsxs("div", { children: [_jsx(Label, { children: t.frequency }), _jsx(Input, { type: "number", step: 1, min: 1, value: vals.frequencyDays, onChange: e => update({ frequencyDays: parseInt(e.target.value || "0", 10) }) })] }), _jsxs("div", { children: [_jsx(Label, { children: t.cycles }), _jsx(Input, { type: "number", step: 1, min: 1, value: vals.cycles ?? "", onChange: e => update({ cycles: e.target.value === "" ? null : parseInt(e.target.value, 10) }) })] })] }), _jsx("h4", { className: "font-medium", children: t.medActions }), _jsx("p", { className: "text-xs opacity-70", children: t.sameDayHint }), _jsx("div", { className: "space-y-2", children: vals.medRules.map((rule) => (_jsxs("div", { className: "grid md:grid-cols-12 items-start gap-2 p-3 rounded-xl border bg-white", children: [_jsxs("div", { className: "md:col-span-2", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Label, { className: "text-xs", children: t.dayField }), _jsx(DayInfo, { t: t })] }), _jsx(DayInput, { value: rule.day, onChange: (n) => updateRule(rule.id, { day: n }) })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx(Label, { className: "text-xs", children: t.timeOfDay }), _jsx(Input, { type: "time", value: rule.time || "", onChange: e => updateRule(rule.id, { time: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-3", children: [_jsx(Label, { className: "text-xs", children: t.title }), _jsx(Input, { value: rule.title, onChange: e => updateRule(rule.id, { title: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-4", children: [_jsx(Label, { className: "text-xs", children: t.notes }), _jsx(Textarea, { rows: 2, value: rule.notes || "", onChange: e => updateRule(rule.id, { notes: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-1 flex items-center gap-2 pt-5", children: [_jsx(Checkbox, { checked: rule.enabled, onCheckedChange: v => updateRule(rule.id, { enabled: !!v }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => duplicateRule(rule), title: STRINGS[localStorage.getItem("locale") || "nl"].duplicateAction, children: _jsx(Copy, { className: "w-4 h-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => deleteRule(rule.id), children: _jsx(Trash2, { className: "w-4 h-4" }) })] })] }, rule.id))) }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", onClick: () => addRule(), children: [_jsx(Plus, { className: "w-4 h-4 mr-2" }), STRINGS[localStorage.getItem("locale") || "nl"].addAction] }), _jsx("div", { className: "flex-1" }), _jsx(Button, { disabled: !dirty, onClick: async () => {
                            const oldSettings = await loadSettings();
                            const oldMoves = await loadMoves();
                            if (oldSettings) {
                                const series = buildAnchors(oldSettings.startDate, oldSettings.frequencyDays, oldMoves);
                                const cutoff = new Date();
                                const frozen = freezePastMoves(series, cutoff, oldSettings.cycles ?? null);
                                const merged = mergeMoves(oldMoves, frozen);
                                await saveMoves(merged);
                            }
                            await saveSettings({ ...vals, medRules: vals.medRules.map((r) => ({ ...r, day: normalizeDayInput(r.day) })) });
                            onSaved();
                        }, children: STRINGS[localStorage.getItem("locale") || "nl"].savePlan })] }), _jsx("p", { className: "text-xs opacity-70", dangerouslySetInnerHTML: { __html: STRINGS[localStorage.getItem("locale") || "nl"].editAffects } })] }));
}
/*** Move Treatment ***/
function MoveTreatment({ settings, moves, onChanged, preselectIndex }) {
    const { t } = useLocale();
    const [index, setIndex] = useState(preselectIndex ?? 0);
    const [newDate, setNewDate] = useState("");
    const series = useMemo(() => buildAnchors(settings.startDate, settings.frequencyDays, moves), [settings, moves]);
    const current = useMemo(() => computeTreatmentDate(series, index), [series, index]);
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "grid md:grid-cols-3 gap-3 items-end", children: [_jsxs("div", { children: [_jsx(Label, { children: t.treatmentOccurrence }), _jsx(Input, { type: "number", min: 1, value: index + 1, onChange: e => setIndex(Math.max(0, (parseInt(e.target.value || "1", 10) - 1))) }), _jsxs("div", { className: "text-xs opacity-70 mt-1", children: [t.currentDate, " ", _jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 border", children: [_jsx(CalendarIcon, { className: "w-3 h-3" }), formatHuman(current)] })] })] }), _jsxs("div", { children: [_jsx(Label, { children: t.moveToDate }), _jsx(Input, { type: "date", value: newDate, onChange: e => setNewDate(e.target.value) })] }), _jsx("div", { className: "flex gap-2", children: _jsx(Button, { onClick: async () => {
                                if (!newDate)
                                    return;
                                const updated = [...moves.filter((m) => m.index !== index), { index, newDateISO: newDate }].sort((a, b) => a.index - b.index);
                                await saveMoves(updated);
                                onChanged();
                            }, children: t.applyMove }) })] }), _jsx("p", { className: "text-xs opacity-70", children: t.moveHelp })] }));
}
/*** Share ***/
function SharePanel() {
    const { t } = useLocale();
    const [events, setEvents] = useState([]);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        (async () => {
            const s = await loadSettings();
            const mv = await loadMoves();
            // Migration on load: convert legacy offset->day and fix 0
            if (s && Array.isArray(s.medRules)) {
                s.medRules = s.medRules.map((r) => {
                    const rawDay = (typeof r.day === "number") ? r.day : (typeof r.offset === "number" ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1);
                    return { ...r, day: normalizeDayInput(rawDay) };
                });
            }
            const evs = buildEvents(s, mv, { monthsAhead: 24 });
            setEvents(evs);
            setReady(true);
        })();
    }, []);
    if (!ready)
        return _jsx("p", { className: "text-sm", children: t.preparing });
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-sm opacity-80", dangerouslySetInnerHTML: { __html: t.shareBody } }), _jsx("div", { className: "flex gap-2", children: _jsxs(Button, { onClick: () => {
                        const ics = generateICS(events, { calendarName: "ChemoCare" });
                        downloadICS(ics, `ChemoCare-${toISODate(new Date())}.ics`);
                    }, children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), t.exportICS] }) }), _jsxs("details", { className: "rounded-lg border p-3", children: [_jsx("summary", { className: "cursor-pointer font-medium", children: t.howToImport }), _jsx("ul", { className: "list-disc ml-6 text-sm mt-2 space-y-1", dangerouslySetInnerHTML: { __html: STRINGS[localStorage.getItem("locale") || "nl"].outlookDesktop + STRINGS[localStorage.getItem("locale") || "nl"].outlookWeb + STRINGS[localStorage.getItem("locale") || "nl"].googleCal + STRINGS[localStorage.getItem("locale") || "nl"].appleCal } }), _jsx("p", { className: "text-xs opacity-70 mt-2", children: t.subNote })] })] }));
}
/*** Month Calendar ***/
function MonthCalendar({ events, onMoveTreatment }) {
    const { t } = useLocale();
    const [cursor, setCursor] = useState(new Date());
    const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = startOfMonth.getDay();
    const gridStart = addDays(startOfMonth, -((startDay + 6) % 7)); // Monday start
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const eventsByDay = useMemo(() => {
        const map = new Map();
        for (const ev of events) {
            const key = toISODate(ev.date);
            if (!map.has(key))
                map.set(key, []);
            map.get(key).push(ev);
        }
        for (const arr of map.values())
            arr.sort((a, b) => a.type === b.type ? 0 : (a.type === "treatment" ? -1 : 1));
        return map;
    }, [events]);
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { variant: "outline", onClick: () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)), children: t.prev }), _jsx("div", { className: "text-lg font-semibold", children: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }) }), _jsx(Button, { variant: "outline", onClick: () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)), children: t.next })] }), _jsxs("div", { className: "grid grid-cols-7 gap-1", children: [t.weekdays.map((d) => _jsx("div", { className: "text-xs text-center opacity-70 py-1", children: d }, d)), days.map((day, i) => {
                        const inMonth = day.getMonth() === cursor.getMonth();
                        const key = toISODate(day);
                        const evs = eventsByDay.get(key) || [];
                        const isToday = isSameDay(day, new Date());
                        return (_jsxs("div", { className: `min-h-[100px] p-2 rounded-xl border ${inMonth ? "bg-white" : "bg-gray-100 opacity-70"} ${isToday ? "ring-2 ring-blue-400" : ""}`, children: [_jsx("div", { className: "text-xs mb-1 opacity-70", children: day.getDate() }), _jsx("div", { className: "space-y-1", children: evs.map((ev) => (_jsxs("div", { className: `text-[11px] px-2 py-1 rounded-full ${ev.type === "treatment" ? "bg-green-100" : "bg-yellow-100"} flex items-center justify-between gap-1`, children: [_jsx("span", { className: "truncate", children: ev.type === 'treatment' ? `${t.treatment} #${ev.index + 1}` : `${ev.title}${ev.rule?.time ? ` · ${formatTime(ev.date)}` : ""}` }), ev.type === "treatment" && _jsx("button", { className: "text-[10px] underline", onClick: () => onMoveTreatment(ev), children: t.moveEllipsis })] }, ev.id))) })] }, i));
                    })] })] }));
}
/*** App ***/
function App() {
    const { t } = useLocale();
    const [loaded, setLoaded] = useState(false);
    const [settings, setSettings] = useState(null);
    const [moves, setMoves] = useState([]);
    const refresh = async () => {
        const s = await loadSettings();
        // MIGRATION: legacy offset -> day, and enforce Day 1 (no Day 0)
        if (s && Array.isArray(s.medRules)) {
            s.medRules = s.medRules.map((r) => {
                const rawDay = (typeof r.day === "number") ? r.day
                    : (typeof r.offset === "number" ? (r.offset >= 0 ? r.offset + 1 : r.offset) : 1);
                return { ...r, day: normalizeDayInput(rawDay) };
            });
        }
        const mv = await loadMoves();
        setSettings(s);
        setMoves(mv);
        setLoaded(true);
    };
    useEffect(() => { refresh(); }, []);
    if (!loaded)
        return _jsx("div", { className: "p-6", children: "Loading\u2026" });
    if (!settings) {
        return (_jsxs("div", { className: "max-w-5xl mx-auto p-4 min-h-screen bg-gray-50 text-gray-900", children: [_jsx(Header, { onReset: async () => { await saveSettings(null); await saveMoves([]); refresh(); } }), _jsx(SetupWizard, { onComplete: () => refresh() })] }));
    }
    const events = buildEvents(settings, moves, { monthsAhead: 18 });
    return (_jsxs("div", { className: "max-w-6xl mx-auto p-4 space-y-4 min-h-screen bg-gray-50 text-gray-900", children: [_jsx(Header, { onReset: async () => { await saveSettings(null); await saveMoves([]); refresh(); } }), _jsxs(Tabs, { defaultValue: "home", children: [_jsxs(TabsList, { className: "flex flex-wrap", children: [_jsx(TabsTrigger, { value: "home", children: t.tabs.home }), _jsx(TabsTrigger, { value: "calendar", children: t.tabs.calendar }), _jsx(TabsTrigger, { value: "plan", children: t.tabs.plan }), _jsx(TabsTrigger, { value: "share", children: t.tabs.share })] }), _jsx(TabsContent, { value: "home", children: _jsx(Home, { settings: settings, moves: moves, refresh: refresh }) }), _jsxs(TabsContent, { value: "calendar", children: [_jsx(MonthCalendar, { events: events, onMoveTreatment: (ev) => {
                                    const dlg = document.getElementById("moveTreatmentDialogBtn");
                                    if (dlg)
                                        dlg.click();
                                    setTimeout(() => setMoveContext(ev), 0);
                                } }), _jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsx("button", { id: "moveTreatmentDialogBtn", style: { display: "none" } }) }), _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: `${STRINGS[localStorage.getItem("locale") || "nl"].moveEllipsis.replace("…", "")} ${t.treatment}` }) }), _jsx(MoveTreatment, { preselectIndex: moveContext?.index || 0, settings: settings, moves: moves, onChanged: refresh })] })] })] }), _jsx(TabsContent, { value: "plan", children: _jsx(PlanEditor, { settings: settings, onSaved: refresh }) }), _jsx(TabsContent, { value: "share", children: _jsx(SharePanel, {}) })] })] }));
}
// local state holder for calendar dialog
let moveContext = null;
function setMoveContext(ev) { moveContext = ev; }
export default App;
/******************** Lightweight runtime tests ********************/
function assertEq(name, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.warn(`❌ ${name} failed`, { a, b });
}
else {
    console.log(`✅ ${name} passed`);
} }
function runLightTests() {
    try {
        const start = "2025-01-01";
        const s = buildAnchors(start, 14, []);
        assertEq("T1", toISODate(computeTreatmentDate(s, 0)), "2025-01-01");
        assertEq("T2", toISODate(computeTreatmentDate(s, 1)), "2025-01-15");
        // Day mapping checks (no Day 0)
        assertEq("Day 1 -> offset 0", dayToOffset(1), 0);
        assertEq("Day 2 -> offset +1", dayToOffset(2), 1);
        assertEq("Day -1 -> offset -1", dayToOffset(-1), -1);
        assertEq("Normalize 0 -> 1", normalizeDayInput(0), 1);
        const settings = {
            startDate: start,
            frequencyDays: 14,
            cycles: 6,
            medRules: [
                { id: "pre", day: -1, title: "Premed", enabled: true, time: "" }, // day before
                { id: "post", day: 2, title: "Post-med", enabled: true, time: "09:00" }, // day after
            ],
        };
        const evs = buildEvents(settings, [], { monthsAhead: 2 });
        const firstTreatment = evs.find((e) => e.id === "treat-0");
        const pre = evs.find((e) => e.id === "act-0-pre");
        const post = evs.find((e) => e.id === "act-0-post");
        assertEq("Treatment Day 1", toISODate(firstTreatment.date), "2025-01-01");
        assertEq("Day -1", toISODate(pre.date), "2024-12-31");
        assertEq("Day 2", toISODate(post.date), "2025-01-02");
    }
    catch (err) {
        console.warn("Tests error", err);
    }
}
if (typeof window !== "undefined") {
    try {
        runLightTests();
    }
    catch { }
}
if (typeof document !== "undefined" && document.getElementById("root")) {
    const root = createRoot(document.getElementById("root"));
    root.render(_jsx(App, {}));
}
