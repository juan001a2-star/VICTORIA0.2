import { useState, useMemo } from "react";
import type { SessionUser } from "@/store";
import { formatMoney } from "@/store";
import {
  Filter, BarChart3, DollarSign, Wallet, TrendingUp, TrendingDown,
  Hash, Ticket, Users, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { t } from "@/i18n";

interface ReportesScreenProps {
  user: SessionUser;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inDateRange(value: any, from: string, to: string): boolean {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T00:00:00").getTime() + 24 * 60 * 60 * 1000;
  return t >= fromMs && t < toMs;
}

const PLAY_TYPE_LABELS: Record<string, string> = {
  directo: "Directo",
  pale: "Pale",
  tripleta: "Tripleta",
  terna: "Terna",
  cuatrena: "Cuatrena",
};

export default function ReportesScreen({ user }: ReportesScreenProps) {
  const lang = user.language || "es";
  const isAdmin = user.role === "admin";
  const isManager = ["admin", "supervisor", "collector"].includes(user.role);
  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const isToday = fromDate === today && toDate === today;
  const [filterGroupId, setFilterGroupId] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterLotteryId, setFilterLotteryId] = useState<string>("");
  const [filterPlayType, setFilterPlayType] = useState<string>("");
  const [showFrequency, setShowFrequency] = useState(true);
  const [showSellers, setShowSellers] = useState(true);

  // Existing queries
  const ticketQuery = trpc.ticket.list.useQuery(isManager ? undefined : { userId: user.id });
  const userQuery = trpc.lotteryUser.list.useQuery(undefined, { enabled: isManager });
  const groupQuery = trpc.group.list.useQuery(undefined, { enabled: isAdmin });
  const summaryQuery = trpc.lotteryUser.creditSummary.useQuery({ from: fromDate, to: toDate });
  const lotteryQuery = trpc.lottery.list.useQuery();

  // New endpoints
  const freqQuery = trpc.report.numberFrequency.useQuery(
    {
      from: fromDate,
      to: toDate,
      lotteryId: filterLotteryId ? Number(filterLotteryId) : undefined,
      playType: filterPlayType || undefined,
      groupId: filterGroupId ? Number(filterGroupId) : undefined,
      userId: filterUserId ? Number(filterUserId) : undefined,
      limit: 150,
    },
    { enabled: isManager, refetchInterval: 30000 }
  );

  const breakdownQuery = trpc.report.salesBreakdown.useQuery(
    {
      from: fromDate,
      to: toDate,
      groupId: filterGroupId ? Number(filterGroupId) : undefined,
      userId: filterUserId ? Number(filterUserId) : undefined,
    },
    { enabled: isManager, refetchInterval: 30000 }
  );

  const allTickets = ticketQuery.data || [];
  const allUsersRaw = userQuery.data || [];
  const allUsers = allUsersRaw.filter((u: any) => u.role === "user");
  const groups = groupQuery.data || [];
  const lotteries = (lotteryQuery.data || []).filter((l: any) => l.active !== false);
  const summary = summaryQuery.data;
  const rows = summary?.rows || [];

  const scopedUsers = useMemo(() => {
    let list = allUsers;
    if (filterGroupId) list = list.filter((u: any) => String(u.groupId) === filterGroupId);
    if (filterUserId) list = list.filter((u: any) => String(u.id) === filterUserId);
    return list;
  }, [allUsers, filterGroupId, filterUserId]);

  const scopedUserIds = useMemo(() => new Set(scopedUsers.map((u: any) => u.id)), [scopedUsers]);

  const ticketsInRange = allTickets.filter((t: any) => {
    if (t.status === "cancelled") return false;
    if (!inDateRange(t.createdAt, fromDate, toDate)) return false;
    if (!isManager) return t.userId === user.id;
    if (filterGroupId || filterUserId) return scopedUserIds.has(t.userId);
    return true;
  });

  const ventas = ticketsInRange.reduce((sum: number, t: any) => sum + Number(t.total), 0);
  const comisiones = ticketsInRange.reduce((sum: number, t: any) => {
    const total = Number(t.total) || 0;
    const net = Number(t.netDeduction) || 0;
    return sum + Math.max(0, total - net);
  }, 0);

  const rowsScoped = rows.filter((r: any) => {
    if (!isManager) return r.userId === user.id;
    if (filterGroupId || filterUserId) return scopedUserIds.has(r.userId);
    return true;
  });

  const premiosPagados = rowsScoped
    .filter((r: any) => r.type === "payout")
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  const cobroVentas = rowsScoped
    .filter((r: any) => r.type === "deposit")
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  const netaVentas = ticketsInRange.reduce((sum: number, t: any) => sum + Number(t.netDeduction), 0);
  const resultadoOperativo = netaVentas - premiosPagados;

  const resetToToday = () => {
    setFromDate(today);
    setToDate(today);
  };

  const freqRows = freqQuery.data?.rows || [];
  const freqTotalPlays = freqQuery.data?.totalPlays || 0;
  const freqTotalAmount = freqQuery.data?.totalAmount || "0.00";
  const sellers = breakdownQuery.data?.sellers || [];
  const sellerTotals = breakdownQuery.data?.totals;

  const exportFrequencyCSV = () => {
    if (!freqRows.length) return;
    const header = "Numero,Tipo,Loteria,Veces,Monto,Tickets\n";
    const lines = freqRows.map((r: any) =>
      `"${r.number}","${PLAY_TYPE_LABELS[r.type] || r.type}","${r.lotteryName}",${r.count},${r.totalAmount},${r.ticketCount || ""}`
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + lines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exposicion-numeros_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSellersCSV = () => {
    if (!sellers.length) return;
    const header = "Vendedor,Banca,Tickets,Ventas,Neto\n";
    const lines = sellers.map((s: any) =>
      `"${s.name}","${s.bankNumber}",${s.tickets},${s.sales},${s.net}`
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + lines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-vendedores_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <BarChart3 size={22} className="text-[var(--bv-primary)]" />
        {t(lang, "ventas_title") || "Reportes"}
      </h2>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-green-100 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-[var(--bv-primary)]" />
          <span className="text-xs font-bold text-[var(--bv-primary-dark)]">
            {isToday ? (t(lang, "balance_today") || "Hoy") : (t(lang, "balance_date_search") || "Rango de fechas")}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
          />
          {!isToday && (
            <button
              onClick={resetToToday}
              className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold"
            >
              {t(lang, "balance_today_btn") || "Hoy"}
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="flex gap-2 mt-2">
            <select
              value={filterGroupId}
              onChange={(e) => {
                setFilterGroupId(e.target.value);
                setFilterUserId("");
              }}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">{t(lang, "report_all_system") || "Todo el sistema"}</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>
                  {(t(lang, "report_by_group") || "Grupo")}: {g.name}
                </option>
              ))}
            </select>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">{t(lang, "report_by_user") || "Todos los vendedores"}</option>
              {(filterGroupId
                ? allUsers.filter((u: any) => String(u.groupId) === filterGroupId)
                : allUsers
              ).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filtros extra para frecuencia */}
        {isManager && (
          <div className="flex gap-2 mt-2">
            <select
              value={filterLotteryId}
              onChange={(e) => setFilterLotteryId(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">Todas las loterías</option>
              {lotteries.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={filterPlayType}
              onChange={(e) => setFilterPlayType(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">Todos los tipos</option>
              {Object.entries(PLAY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={14} className="text-blue-600" />
            <p className="text-[10px] font-medium text-gray-500">{t(lang, "report_sales") || "Ventas"}</p>
          </div>
          <p className="text-lg font-bold text-blue-700">${formatMoney(ventas)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={14} className="text-purple-600" />
            <p className="text-[10px] font-medium text-gray-500">{t(lang, "report_commissions") || "Comisiones"}</p>
          </div>
          <p className="text-lg font-bold text-purple-700">${formatMoney(comisiones)}</p>
        </div>
        <div className="bg-[var(--bv-primary-light)] rounded-xl p-3 border border-green-100">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={14} className="text-[var(--bv-primary)]" />
            <p className="text-[10px] font-medium text-[var(--bv-primary-dark)]">
              {t(lang, "report_sales_collection") || "Cobro ventas"}
            </p>
          </div>
          <p className="text-lg font-bold text-[var(--bv-primary-dark)]">${formatMoney(cobroVentas)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 border border-red-100">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={14} className="text-red-500" />
            <p className="text-[10px] font-medium text-gray-500">{t(lang, "report_prizes_paid") || "Premios pagados"}</p>
          </div>
          <p className="text-lg font-bold text-red-600">${formatMoney(premiosPagados)}</p>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        {(t(lang, "report_sales") || "Ventas")} netas ${formatMoney(netaVentas)} −{" "}
        {(t(lang, "report_prizes_paid") || "Premios")} ${formatMoney(premiosPagados)} ={" "}
        <span className={resultadoOperativo >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
          ${formatMoney(resultadoOperativo)}
        </span>
      </p>

      {/* ===== QUIÉN VENDIÓ (desglose por vendedor) ===== */}
      {isManager && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowSellers(!showSellers)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100"
          >
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[var(--bv-primary)]" />
              <span className="text-sm font-bold text-gray-800">Quién vendió</span>
              {sellerTotals && (
                <span className="text-[10px] text-gray-500">
                  ({sellerTotals.tickets} tickets · ${formatMoney(Number(sellerTotals.sales))})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); exportSellersCSV(); }} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">
                <Download size={12} /> CSV
              </button>
              {showSellers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {showSellers && (
            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {breakdownQuery.isLoading && (
                <p className="text-xs text-gray-400 text-center py-4">Cargando…</p>
              )}
              {!breakdownQuery.isLoading && sellers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Sin actividad en el período</p>
              )}
              {sellers.map((s: any) => (
                <div
                  key={s.userId}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{s.name}</p>
                    <p className="text-[10px] text-gray-400">
                      #{s.bankNumber} · {s.tickets} ticket{s.tickets !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-700">${formatMoney(Number(s.sales))}</p>
                    <p className="text-[10px] text-gray-500">neto ${formatMoney(Number(s.net))}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== EXPOSICIÓN / FRECUENCIA DE NÚMEROS ===== */}
      {isManager && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowFrequency(!showFrequency)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-amber-50 border-b border-amber-100"
          >
            <div className="flex items-center gap-2">
              <Hash size={16} className="text-amber-600" />
              <span className="text-sm font-bold text-gray-800">Exposición de números</span>
              <span className="text-[10px] text-gray-500">
                ({freqTotalPlays} jugadas · ${formatMoney(Number(freqTotalAmount))})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); exportFrequencyCSV(); }} className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">
                <Download size={12} /> CSV
              </button>
              {showFrequency ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {showFrequency && (
            <div className="p-2">
              <p className="text-[10px] text-gray-500 px-1 mb-2">
                Cuántas veces se vendió cada número/combinación y el monto total apostado. Ordenado por mayor exposición.
              </p>
              {freqQuery.isLoading && (
                <p className="text-xs text-gray-400 text-center py-6">Cargando frecuencia…</p>
              )}
              {!freqQuery.isLoading && freqRows.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">Sin jugadas en el período seleccionado</p>
              )}
              {freqRows.length > 0 && (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-[10px] text-gray-500 border-b border-gray-100">
                        <th className="px-2 py-1.5 font-bold">Número</th>
                        <th className="px-2 py-1.5 font-bold">Tipo</th>
                        <th className="px-2 py-1.5 font-bold">Lotería</th>
                        <th className="px-2 py-1.5 font-bold text-right">Veces</th>
                        <th className="px-2 py-1.5 font-bold text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freqRows.map((r: any, idx: number) => (
                        <tr
                          key={`${r.lotteryId}-${r.type}-${r.number}-${idx}`}
                          className={`text-xs border-b border-gray-50 ${
                            idx < 5 ? "bg-amber-50/50" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5 font-mono font-bold text-gray-900">{r.number}</td>
                          <td className="px-2 py-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                              {PLAY_TYPE_LABELS[r.type] || r.type}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 truncate max-w-[100px]">{r.lotteryName}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-amber-700">{r.count}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-blue-700">
                            ${formatMoney(Number(r.totalAmount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actividad por vendedor (legacy cards — kept for compatibility) */}
      {isManager && !breakdownQuery.data && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <Ticket size={14} /> Actividad por vendedor
          </h3>
          {scopedUsers.map((u: any) => {
            const uTickets = ticketsInRange.filter((t: any) => t.userId === u.id);
            const uSales = uTickets.reduce((sum: number, t: any) => sum + Number(t.total), 0);
            const uComm = uTickets.reduce(
              (sum: number, t: any) => sum + Math.max(0, Number(t.total) - Number(t.netDeduction)),
              0
            );
            const uRows = rowsScoped.filter((r: any) => r.userId === u.id);
            const uCobro = uRows
              .filter((r: any) => r.type === "deposit")
              .reduce((s: number, r: any) => s + Number(r.amount), 0);
            const uPremios = uRows
              .filter((r: any) => r.type === "payout")
              .reduce((s: number, r: any) => s + Number(r.amount), 0);
            if (uTickets.length === 0 && uRows.length === 0) return null;
            return (
              <div key={u.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <p className="text-sm font-bold text-gray-900 mb-2">
                  {u.name}{" "}
                  <span className="text-[10px] font-normal text-gray-400">({u.bankNumber})</span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-blue-50 rounded p-1.5">
                    <p className="text-xs font-bold text-blue-700">${formatMoney(uSales)}</p>
                    <p className="text-[8px] text-gray-500">{t(lang, "report_sales") || "Ventas"}</p>
                  </div>
                  <div className="bg-purple-50 rounded p-1.5">
                    <p className="text-xs font-bold text-purple-700">${formatMoney(uComm)}</p>
                    <p className="text-[8px] text-gray-500">{t(lang, "report_commissions") || "Comisiones"}</p>
                  </div>
                  <div className="bg-[var(--bv-primary-light)] rounded p-1.5">
                    <p className="text-xs font-bold text-[var(--bv-primary-dark)]">${formatMoney(uCobro)}</p>
                    <p className="text-[8px] text-gray-500">
                      {t(lang, "report_sales_collection") || "Cobro"}
                    </p>
                  </div>
                  <div className="bg-red-50 rounded p-1.5">
                    <p className="text-xs font-bold text-red-600">${formatMoney(uPremios)}</p>
                    <p className="text-[8px] text-gray-500">
                      {t(lang, "report_prizes_paid") || "Premios"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
