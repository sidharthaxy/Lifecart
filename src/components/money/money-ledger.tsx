"use client";

import { useMemo, useRef, useState } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Download, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { money } from "@/lib/format";
import type { LedgerRow } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#1F3FB0",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  fontSize: 14,
  foregroundColor: "#0E1726",
  headerBackgroundColor: "#F9FAFB",
  headerTextColor: "#4A5468",
  headerFontWeight: 600,
  borderColor: "#E3E7EE",
  rowHoverColor: "#F6F8FF",
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  cellHorizontalPadding: 14,
});

function WhatCell({ data }: CustomCellRendererProps<LedgerRow>) {
  if (!data) return null;
  return (
    <div className="flex h-full flex-col justify-center leading-snug">
      <span className="truncate font-semibold" title={data.title}>
        {data.title}
      </span>
      <span className="truncate text-[13px] text-muted-foreground" title={data.detail}>
        {data.detail}
      </span>
    </div>
  );
}

function StatusCell({ data }: CustomCellRendererProps<LedgerRow>) {
  if (!data) return null;
  const s = data.status.toLowerCase();
  const tone = /refund|cancel/.test(s) ? "bg-muted text-muted-foreground" : /complet|active|paid/.test(s) ? "bg-success-soft text-[#0B4F31]" : "bg-warning-soft text-[#5C3800]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{data.status}</span>;
}

function VerifiedCell({ data }: CustomCellRendererProps<LedgerRow>) {
  if (!data) return null;
  const ok = data.verified === "Verified with PayPal";
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <span className={`flex items-center gap-1.5 text-[13px] ${ok ? "text-foreground" : "text-[#5C3800]"}`} title={data.paypalId ?? ""}>
      <Icon className={`size-4 shrink-0 ${ok ? "text-success" : "text-warning"}`} aria-hidden />
      {ok ? "Matches PayPal" : data.verified}
    </span>
  );
}

const amount = (v: number | null | undefined) => (v ? money(v) : "—");

export function MoneyLedger({ rows }: { rows: LedgerRow[] }) {
  const grid = useRef<AgGridReact<LedgerRow>>(null);
  const [q, setQ] = useState("");
  const cols = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 116,
        sort: "desc",
        valueFormatter: (p) => new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      },
      { field: "title", headerName: "What", flex: 2, minWidth: 240, cellRenderer: WhatCell, getQuickFilterText: (p) => `${p.data?.title} ${p.data?.detail}` },
      { field: "source", headerName: "Type", width: 118 },
      { field: "status", headerName: "Status", width: 150, cellRenderer: StatusCell },
      { field: "amount", headerName: "Amount", width: 120, type: "rightAligned", valueFormatter: (p) => money(p.value), cellClass: "tabular" },
      {
        field: "counted",
        headerName: "Counts as spent",
        width: 150,
        type: "rightAligned",
        valueFormatter: (p) => amount(p.value),
        cellClass: "tabular font-semibold",
        headerTooltip: "After refunds. Refills count what PayPal actually charged; invoices count once paid.",
      },
      { field: "saved", headerName: "Saved", width: 110, type: "rightAligned", valueFormatter: (p) => amount(p.value), cellClass: "tabular" },
      { field: "verified", headerName: "PayPal check", width: 170, cellRenderer: VerifiedCell },
      { field: "paypalId", headerName: "PayPal ID", width: 200, cellClass: "font-mono text-xs" },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search payments</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments, stores, PayPal IDs" className="w-full bg-transparent outline-none" />
        </label>
        <button
          type="button"
          onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "lifecart-payments.csv" })}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <Download className="size-4" aria-hidden /> Export CSV
        </button>
      </div>
      <div className="h-[520px] overflow-hidden rounded-xl border border-border">
        <AgGridReact<LedgerRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          rowHeight={60}
          quickFilterText={q}
          getRowId={(p) => p.data.id}
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
          overlayNoRowsTemplate="No payments yet. Pay for a plan or a bill and it shows up here."
        />
      </div>
    </div>
  );
}
