import { useState, useMemo } from "react";
import type { SessionUser } from "@/store";
import { formatMoney } from "@/store";
import { BarChart3, Calendar, Filter, ChevronRight, ArrowLeft, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";

interface MonitoreoScreenProps {
  user: SessionUser;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TYPE_LABELS: Record<string, string> = {
  directo: "Directo",
  pale: "Palé",
  tripleta: "Tripleta",
  terna: "Tres Cifras",
  cuatrena: "Cuatro Cifras",
  tres_cifras: "Tres Cifras",
  cuatro_cifras: "Cuatro Cifras",
};

export default function MonitoreoScreen({ user }: MonitoreoScreenProps) {
  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"count" | "amount" | "number">("count");

  const usersQuery = trpc.lotteryUser.list.useQuery();
  const monitoring = trpc.report.monitoring.useQuery({
    fromDate,
    toDate,
    userId: filterUserId ? Number(filterUserId) : undefined,
  });

  const users = (usersQuery.data || []).filter((u: any) => u.role === "user" || u.role === "seller");
  const data = monitoring.data;
  const summary = data?.summary;
  const byType = data?.byType || [];
  const byNumber = data?.byNumber || [];

  const detailList = useMemo(() => {
    if (!selectedType) return [];
    let list = byNumber.filter((n) => n.type === selectedType);
    if (sortBy === "count") list = [...list].sort((a, b) => b.count - a.count);
    else if (sortBy === "amount") list = [...list].sort((a, b) => Number(b.amount) - Number(a.amount));
    else list = [...list].sort((a, b) => a.number.localeCompare(b.number));
    return list;
  }, [selectedType, byNumber, sortBy]);

  const totalByTypeCount = byType.reduce((s, t) => s + t.count, 0);
  const totalByTypeAmount = byType.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--bv-primary)] to-green-800 text-white px-4 pt-4 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={22} />
          <h1 className="text-lg font-bold">Contabilidad y Monitoreo</h1>
        </div>
        <p className="text-green-100 text-xs">Ventas por tipo de jugada y por número</p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Filter size={16} className="text-[var(--bv-primary)]" />
            Filtros
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1">
                <Calendar size={12} /> Desde
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1">
                <Calendar size={12} /> Hasta
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1">
              <Users size={12} /> Vendedor
            </label>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Todos los vendedores</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.bankNumber})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[11px] text-gray-500">Total vendido</p>
              <p className="text-lg font-extrabold text-[var(--bv-primary-dark)]">${formatMoney(summary.totalSales)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[11px] text-gray-500">Tickets</p>
              <p className="text-lg font-extrabold text-gray-900">{summary.totalTickets}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[11px] text-gray-500">Comisiones</p>
              <p className="text-lg font-extrabold text-amber-600">${formatMoney(summary.totalCommission)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[11px] text-gray-500">Premios</p>
              <p className="text-lg font-extrabold text-blue-600">${formatMoney(summary.totalPrizes)}</p>
            </div>
          </div>
        )}

        {/* Detalle por tipo o por número */}
        {!selectedType ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-sm">Por tipo de jugada</h2>
              <p className="text-[11px] text-gray-500">Toca un tipo para ver el detalle por número</p>
            </div>
            {monitoring.isLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Cargando...</div>
            ) : byType.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Sin ventas en el rango seleccionado</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {byType.map((row) => (
                  <button
                    key={row.type}
                    onClick={() => setSelectedType(row.type)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-green-50 transition-colors text-left"
                  >
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{TYPE_LABELS[row.type] || row.type}</p>
                      <p className="text-[11px] text-gray-500">{row.count} jugadas</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--bv-primary-dark)] text-sm">${formatMoney(row.amount)}</span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </button>
                ))}
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-sm">TOTAL</span>
                  <div className="text-right">
                    <span className="text-[11px] text-gray-500 block">{totalByTypeCount} jugadas</span>
                    <span className="font-extrabold text-[var(--bv-primary-dark)]">${formatMoney(totalByTypeAmount.toFixed(2))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <button
                onClick={() => setSelectedType(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft size={18} className="text-gray-600" />
              </button>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 text-sm">{TYPE_LABELS[selectedType] || selectedType} – Detalle</h2>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1"
              >
                <option value="count">Cantidad</option>
                <option value="amount">Monto</option>
                <option value="number">Número</option>
              </select>
            </div>
            {detailList.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Sin datos</div>
            ) : (
              <div className="divide-y divide-gray-50">
                <div className="px-4 py-2 bg-gray-50 grid grid-cols-3 text-[11px] font-semibold text-gray-500">
                  <span>Número / Comb.</span>
                  <span className="text-center">Cantidad</span>
                  <span className="text-right">Monto</span>
                </div>
                {detailList.map((row) => (
                  <div key={`${row.type}-${row.number}`} className="px-4 py-2.5 grid grid-cols-3 items-center text-sm">
                    <span className="font-bold text-gray-900">{row.number}</span>
                    <span className="text-center text-gray-600">{row.count}</span>
                    <span className="text-right font-semibold text-[var(--bv-primary-dark)]">${formatMoney(row.amount)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 bg-gray-50 grid grid-cols-3 items-center">
                  <span className="font-bold text-gray-900 text-sm">TOTAL</span>
                  <span className="text-center font-bold text-sm">{detailList.reduce((s, r) => s + r.count, 0)}</span>
                  <span className="text-right font-extrabold text-[var(--bv-primary-dark)]">
                    ${formatMoney(detailList.reduce((s, r) => s + Number(r.amount), 0).toFixed(2))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
