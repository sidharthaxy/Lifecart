"use client";

import { useMemo } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClassParams } from "ag-grid-community";
import { money } from "@/lib/format";
import type { ItemView } from "@/lib/totals";
import { IndependentBadge, PayPill, Sparkline, priceVerdict } from "./bits";

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
  cellHorizontalPadding: 16,
});

type GroupRow = { group: true; id: string; title: string; why: string | null };
type Row = ItemView | GroupRow;
const isGroup = (r: Row | undefined): r is GroupRow => Boolean(r && "group" in r);

function ItemCell({ data }: CustomCellRendererProps<Row>) {
  if (!data || isGroup(data)) return null;
  return (
    <div className="flex h-full items-center gap-3 py-2">
      {data.offer?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.offer.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-border bg-white object-contain" />
      ) : (
        <span className="size-12 shrink-0 rounded-lg border border-dashed border-border bg-muted" aria-hidden />
      )}
      <div className="flex min-w-0 flex-col leading-snug">
        <span className="truncate font-semibold" title={data.name}>
          {data.name}
          {data.qty > 1 && data.kind !== "service" && <span className="font-normal text-muted-foreground"> × {data.qty}</span>}
        </span>
        <span className="line-clamp-2 whitespace-normal text-[13px] text-muted-foreground">{data.reason}</span>
      </div>
    </div>
  );
}

function StoreCell({ data }: CustomCellRendererProps<Row>) {
  if (!data || isGroup(data)) return null;
  const o = data.offer;
  return (
    <div className="flex h-full flex-col justify-center gap-1 leading-tight">
      <span className="truncate text-sm">{o?.source === "estimate" ? (data.kind === "service" ? o.merchant : "No exact listing") : o?.merchant}</span>
      {o?.source === "estimate" ? (
        <span className="text-[11px] text-muted-foreground">Estimate</span>
      ) : o?.independent ? (
        <span>
          <IndependentBadge />
        </span>
      ) : null}
    </div>
  );
}

function HistoryCell({ data }: CustomCellRendererProps<Row>) {
  if (!data || isGroup(data)) return null;
  const v = priceVerdict(data.offer);
  if (!data.history.length && !v) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex h-full flex-col justify-center gap-0.5">
      <Sparkline points={data.history} label={`90-day price trend for ${data.name}`} />
      {v && <span className={v.tone === "good" ? "text-xs text-success" : v.tone === "bad" ? "text-xs text-warning" : "text-xs text-muted-foreground"}>{v.label}</span>}
    </div>
  );
}

function PayCell({ data }: CustomCellRendererProps<Row>) {
  if (!data || isGroup(data)) return null;
  return (
    <div className="flex h-full items-center">
      <PayPill type={data.payType} />
    </div>
  );
}

function PriceCell({ data }: CustomCellRendererProps<Row>) {
  if (!data || isGroup(data)) return null;
  const p = data.offer?.price ?? data.estimatedPrice;
  return (
    <div className="flex h-full flex-col items-end justify-center leading-tight">
      <span className="tabular font-semibold">
        {money(p)}
        {data.cadence === "monthly" && <span className="font-normal text-muted-foreground">/mo</span>}
      </span>
      {data.offer?.wasPrice ? <span className="tabular text-xs text-muted-foreground line-through">{money(data.offer.wasPrice)}</span> : null}
      {data.payType === "watch" && data.targetPrice ? <span className="tabular text-xs text-warning">Target {money(data.targetPrice)}</span> : null}
    </div>
  );
}

type GridContext = { onWatch: (id: string, on: boolean) => void; busy: string | null };

function ActionCell({ data, context }: CustomCellRendererProps<Row, unknown, GridContext>) {
  if (!data || isGroup(data)) return null;
  if (data.purchased)
    return (
      <div className="flex h-full items-center justify-end">
        <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">Bought ✓</span>
      </div>
    );
  if (data.kind === "service") return null;
  const watching = data.payType === "watch";
  const busy = context?.busy === data.id;
  return (
    <div className="flex h-full items-center justify-end">
      <button
        type="button"
        disabled={busy}
        aria-label={watching ? `Buy ${data.name} now` : `Watch ${data.name} for a lower price`}
        onClick={(e) => {
          e.stopPropagation(); // don't open the drawer
          context?.onWatch(data.id, !watching);
        }}
        className={
          watching
            ? "min-h-9 min-w-[84px] rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
            : "min-h-9 min-w-[84px] rounded-lg border border-[#C98A1E] bg-card px-3 text-[13px] font-semibold text-warning hover:bg-warning-soft disabled:opacity-60"
        }
      >
        {busy ? "…" : watching ? "Buy now" : "Watch"}
      </button>
    </div>
  );
}

function GroupHeader({ data }: CustomCellRendererProps<Row>) {
  if (!isGroup(data)) return null;
  return (
    <div className="flex h-full items-end gap-2 px-4 pb-1.5 text-[13px]">
      <span className="font-semibold text-primary">{data.title}</span>
      {data.why && <span className="text-muted-foreground">{data.why}</span>}
    </div>
  );
}

export function PlanGrid({
  items,
  onSelect,
  onWatch,
  busy = null,
  quickFilter,
}: {
  items: ItemView[];
  onSelect: (id: string) => void;
  onWatch: (id: string, on: boolean) => void;
  busy?: string | null;
  quickFilter?: string;
}) {
  const context = useMemo<GridContext>(() => ({ onWatch, busy }), [onWatch, busy]);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = "";
    for (const it of items) {
      if (it.category !== last) {
        out.push({ group: true, id: `g:${it.category}`, title: it.category, why: it.categoryWhy });
        last = it.category;
      }
      out.push(it);
    }
    return out;
  }, [items]);

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: "Item and why", flex: 3, minWidth: 250, cellRenderer: ItemCell, getQuickFilterText: (p) => (isGroup(p.data) ? "" : `${p.data!.name} ${p.data!.reason}`) },
      { headerName: "Best offer", flex: 1.2, minWidth: 130, cellRenderer: StoreCell, getQuickFilterText: (p) => (isGroup(p.data) ? "" : p.data!.offer?.merchant ?? "") },
      { headerName: "Price history", flex: 1, minWidth: 120, cellRenderer: HistoryCell },
      { headerName: "Pays as", width: 118, cellRenderer: PayCell },
      { headerName: "Price", width: 112, cellRenderer: PriceCell, headerClass: "ag-right-aligned-header" },
      { headerName: "", colId: "action", width: 112, cellRenderer: ActionCell },
    ],
    [],
  );

  return (
    <div className="w-full">
      <AgGridReact<Row>
        theme={theme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: false, resizable: false, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        getRowHeight={(p) => (isGroup(p.data) ? 40 : 84)}
        isFullWidthRow={(p) => isGroup(p.rowNode.data)}
        fullWidthCellRenderer={GroupHeader}
        getRowClass={(p: RowClassParams<Row>) => (isGroup(p.data) ? "lc-group-row" : "cursor-pointer")}
        onRowClicked={(e) => {
          // AG Grid's row listener isn't React's, so ignore clicks that came from a button inside the row.
          if ((e.event?.target as HTMLElement | null)?.closest("button")) return;
          if (!isGroup(e.data) && e.data) onSelect(e.data.id);
        }}
        quickFilterText={quickFilter}
        context={context}
        suppressCellFocus
        domLayout="autoHeight"
      />
    </div>
  );
}
