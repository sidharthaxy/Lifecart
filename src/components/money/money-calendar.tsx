"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/money";
import { CALENDAR_LANES } from "./lanes";

/**
 * Bryntum Calendar, loaded at runtime from /vendor/bryntum (copied there by scripts/copy-bryntum.mjs).
 * It's deliberately NOT imported through the bundler: Turbopack parsing the 5 MB obfuscated trial build
 * used tens of GB of memory. The browser loads it once and caches it.
 */
const BASE = "/vendor/bryntum";

type BryntumCalendar = { destroy: () => void };
type BryntumModule = { Calendar: new (config: Record<string, unknown>) => BryntumCalendar };

let modulePromise: Promise<BryntumModule> | null = null;
function loadBryntum() {
  for (const href of [`${BASE}/fontawesome/css/fontawesome.css`, `${BASE}/fontawesome/css/solid.css`, `${BASE}/calendar.css`, `${BASE}/svalbard-light.css`]) {
    if (!document.querySelector(`link[href="${href}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }
  }
  modulePromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}/calendar.module.js`) as Promise<BryntumModule>;
  return modulePromise;
}

export function MoneyCalendar({ events }: { events: CalendarEvent[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cal: BryntumCalendar | null = null;
    let cancelled = false;
    loadBryntum()
      .then(({ Calendar }) => {
        if (cancelled || !host.current) return;
        cal = new Calendar({
          appendTo: host.current,
          date: new Date(),
          mode: "month",
          readOnly: true,
          sidebar: false,
          resources: CALENDAR_LANES.map((l) => ({ ...l })),
          events,
          modes: { day: null, week: null, year: null, agenda: { title: "List" }, month: {} },
          features: { eventTooltip: { tools: { edit: false, delete: false } }, eventMenu: false, scheduleMenu: false },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      cal?.destroy();
    };
  }, [events]);

  if (failed) return <p className="text-sm text-muted-foreground">The calendar couldn&apos;t load. Every payment is still listed in the table above.</p>;
  return <div ref={host} className="money-calendar h-[640px] overflow-hidden rounded-xl border border-border" />;
}
