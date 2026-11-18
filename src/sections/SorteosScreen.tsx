import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import type { SessionUser } from "@/store";
import { Trophy, Plus, Lock, Download, RefreshCw, CheckCircle, AlertTriangle, Bell } from "lucide-react";
import { t } from "@/i18n";
import { pushAppNotification } from "@/sections/SettingsScreen";

interface SorteosScreenProps {
  user: SessionUser;
}

export default function SorteosScreen({ user }: SorteosScreenProps) {
  const lang = user.language || "es";
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedLottery, setSelectedLottery] = useState<number | undefined>();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newWinner, setNewWinner] = useState({ lotteryId: 0, firstPrize: "", secondPrize: "", thirdPrize: "" });
  const [message, setMessage] = useState("");
  const [selectedImport, setSelectedImport] = useState<Record<number, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [pendingAlert, setPendingAlert] = useState(0);
  const alertedRef = useRef<string>("");

  const canEdit = ["admin", "supervisor", "collector"].includes(user.role);
  const canImport = ["admin", "supervisor"].includes(user.role);

  const lotteryQuery = trpc.lottery.list.useQuery();
  const winnerQuery = trpc.winner.list.useQuery({ drawDate: selectedDate.replace(/-/g, "") });
  const utils = trpc.useUtils();
  const createWinner = trpc.winner.create.useMutation({
    onSuccess: () => {
      utils.winner.list.invalidate();
      utils.results?.checkNew?.invalidate?.();
    },
  });

  // Vista previa de scrape (solo managers)
  const previewQuery = trpc.results.preview.useQuery(
    { date: selectedDate },
    { enabled: canImport && showImport, staleTime: 30_000 }
  );

  // Alerta post-cierre: loterías que cerraron hace ≥10 min sin resultado (+ scrape)
  const dueQuery = trpc.results.dueAfterClose.useQuery(
    { delayMinutes: 10, windowHours: 6, scrape: true },
    { enabled: canImport, refetchInterval: 90_000 }
  );

  // Números detectados aunque el horario aún no marque “cerrado”
  const checkNewQuery = trpc.results.checkNew.useQuery(undefined, {
    enabled: canImport,
    refetchInterval: 180_000,
  });

  const lotteries = (lotteryQuery.data || []).filter((l: any) => l.active);
  const winners = winnerQuery.data || [];

  useEffect(() => {
    const dueCount = dueQuery.data?.needActionCount ?? 0;
    const scrapeCount = checkNewQuery.data?.pendingCount ?? 0;
    const count = Math.max(dueCount, scrapeCount);
    setPendingAlert(count);

    const dueItems = dueQuery.data?.needAction || [];
    const withNums = dueItems.filter((x: any) => x.scraped);
    if (dueCount > 0) {
      const key = `due-${dueQuery.data?.checkedAt}-${dueCount}`;
      if (alertedRef.current !== key) {
        alertedRef.current = key;
        const names = dueItems.slice(0, 3).map((p: any) => p.lotteryName).join(", ");
        pushAppNotification(
          withNums.length ? "Resultados listos para confirmar" : "Sorteos cerrados sin resultado",
          withNums.length
            ? `${withNums.length} con números detectados · ${names}${dueCount > 3 ? "…" : ""}. Abre Sorteos → Importar.`
            : `${dueCount} lotería(s) cerraron y aún no tienen resultado: ${names}${dueCount > 3 ? "…" : ""}.`,
          "updateAvailable"
        );
      }
    } else if (scrapeCount > 0) {
      const key = `scrape-${checkNewQuery.data?.date}-${scrapeCount}`;
      if (alertedRef.current !== key) {
        alertedRef.current = key;
        const names = (checkNewQuery.data?.pending || [])
          .slice(0, 3)
          .map((p: any) => p.lotteryName)
          .join(", ");
        pushAppNotification(
          "Resultados disponibles",
          `${scrapeCount} lotería(s) con números detectados: ${names}${scrapeCount > 3 ? "…" : ""}. Revisa y confirma.`,
          "updateAvailable"
        );
      }
    }
  }, [dueQuery.data, checkNewQuery.data]);

  const showMsg = (m: string, ms = 3500) => {
    setMessage(m);
    setTimeout(() => setMessage(""), ms);
  };

  const handleSave = () => {
    if (!newWinner.lotteryId || !newWinner.firstPrize || !newWinner.secondPrize || !newWinner.thirdPrize) {
      showMsg(t(lang, "sorteos_complete_fields"));
      return;
    }
    createWinner.mutate(
      {
        lotteryId: newWinner.lotteryId,
        firstPrize: newWinner.firstPrize,
        secondPrize: newWinner.secondPrize,
        thirdPrize: newWinner.thirdPrize,
        drawDate: selectedDate.replace(/-/g, ""),
      },
      {
        onSuccess: () => {
          showMsg(t(lang, "sorteos_saving"));
          setShowAddForm(false);
          setNewWinner({ lotteryId: 0, firstPrize: "", secondPrize: "", thirdPrize: "" });
        },
        onError: (err) => showMsg("Error: " + err.message, 4000),
      }
    );
  };

  const toggleImportItem = (lotteryId: number) => {
    setSelectedImport((prev) => ({ ...prev, [lotteryId]: !prev[lotteryId] }));
  };

  const selectAllImportable = () => {
    const items = previewQuery.data?.items || [];
    const next: Record<number, boolean> = {};
    for (const it of items) {
      if (it.scraped && !it.alreadyImported) next[it.lotteryId] = true;
    }
    setSelectedImport(next);
  };

  const handleImportConfirmed = async () => {
    const items = previewQuery.data?.items || [];
    const toImport = items.filter(
      (it: any) => selectedImport[it.lotteryId] && it.scraped && !it.alreadyImported
    );
    if (toImport.length === 0) {
      showMsg("Selecciona al menos una lotería con números detectados");
      return;
    }
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const it of toImport) {
      try {
        await createWinner.mutateAsync({
          lotteryId: it.lotteryId,
          firstPrize: it.scraped.firstPrize,
          secondPrize: it.scraped.secondPrize,
          thirdPrize: it.scraped.thirdPrize,
          drawDate: selectedDate.replace(/-/g, ""),
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setImporting(false);
    setSelectedImport({});
    utils.winner.list.invalidate();
    previewQuery.refetch();
    checkNewQuery.refetch();
    showMsg(`Importados: ${ok}${fail ? ` · Errores: ${fail}` : ""}`, 5000);
    if (ok > 0) setShowImport(false);
  };

  const filtered = winners.filter((w: any) => {
    const d = selectedDate.replace(/-/g, "");
    return (!selectedLottery || w.lotteryId === selectedLottery) && w.drawDate === d;
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{t(lang, "sorteos_title")}</h2>
          <div className="flex items-center gap-2">
            {canImport && pendingAlert > 0 && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="relative flex items-center gap-1 px-2.5 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600"
              >
                <Bell size={14} />
                <span>{pendingAlert}</span>
              </button>
            )}
            {canImport && (
              <button
                type="button"
                onClick={() => {
                  setShowImport(true);
                  setSelectedImport({});
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                title="Importar resultados detectados"
              >
                <Download size={16} />
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bv-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--bv-primary-dark)]"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <Lock size={14} className="text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-700">{t(lang, "sorteos_admin_only")}</p>
          </div>
        )}

        {message && (
          <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{message}</div>
        )}

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm"
        />

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedLottery(undefined)}
            className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg ${
              !selectedLottery ? "bg-[var(--bv-primary)] text-white" : "bg-green-100 text-[var(--bv-primary-dark)]"
            }`}
          >
            {t(lang, "sorteos_all_lotteries")}
          </button>
          {lotteries.map((l: any) => (
            <button
              key={l.id}
              onClick={() => setSelectedLottery(l.id)}
              className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg ${
                selectedLottery === l.id
                  ? "bg-[var(--bv-primary)] text-white"
                  : "bg-green-100 text-[var(--bv-primary-dark)]"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-3">
        {filtered.length > 0 ? (
          filtered.map((w: any) => {
            const lottery = lotteries.find((l: any) => l.id === w.lotteryId);
            return (
              <div key={w.id} className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">
                    {lottery?.name || `Loteria #${w.lotteryId}`}
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <Trophy size={16} className="mx-auto text-yellow-600 mb-1" />
                    <p className="text-lg font-extrabold text-yellow-700">{w.firstPrize}</p>
                    <p className="text-[10px] text-gray-500">{t(lang, "sorteos_first")}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-lg font-extrabold text-gray-800">{w.secondPrize}</p>
                    <p className="text-[10px] text-gray-500">{t(lang, "sorteos_second")}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-lg font-extrabold text-orange-700">{w.thirdPrize}</p>
                    <p className="text-[10px] text-gray-500">{t(lang, "sorteos_third")}</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Trophy size={48} className="mb-3 text-green-200" />
            <p className="text-sm">{t(lang, "sorteos_no_results")}</p>
            {canImport && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold"
              >
                Buscar resultados externos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Formulario manual */}
      {showAddForm && canEdit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 mb-4">{t(lang, "sorteos_title")}</h3>
            <div className="space-y-3">
              <select
                value={newWinner.lotteryId}
                onChange={(e) => setNewWinner({ ...newWinner, lotteryId: Number(e.target.value) })}
                className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm"
              >
                <option value={0}>{t(lang, "sorteos_select_lottery")}</option>
                {lotteries.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={newWinner.firstPrize}
                  onChange={(e) => setNewWinner({ ...newWinner, firstPrize: e.target.value })}
                  placeholder={t(lang, "sorteos_first")}
                  maxLength={6}
                  className="px-2 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold"
                />
                <input
                  value={newWinner.secondPrize}
                  onChange={(e) => setNewWinner({ ...newWinner, secondPrize: e.target.value })}
                  placeholder={t(lang, "sorteos_second")}
                  maxLength={6}
                  className="px-2 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold"
                />
                <input
                  value={newWinner.thirdPrize}
                  onChange={(e) => setNewWinner({ ...newWinner, thirdPrize: e.target.value })}
                  placeholder={t(lang, "sorteos_third")}
                  maxLength={6}
                  className="px-2 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--bv-primary)] text-white font-bold text-sm"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal vista previa e importación */}
      {showImport && canImport && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-lg text-gray-900">Importar resultados</h3>
              <p className="text-[11px] text-gray-500">
                Vista previa · {selectedDate} · Confirma antes de guardar
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => previewQuery.refetch()}
                disabled={previewQuery.isFetching}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                title="Actualizar scrape"
              >
                <RefreshCw size={16} className={previewQuery.isFetching ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800 shrink-0">
            <AlertTriangle size={12} className="inline mr-1" />
            Los números detectados NO se guardan solos. Revisa cada uno y confirma. Fuentes externas no son
            oficiales: verifica premios grandes contra la página de la lotería.
          </div>

          {previewQuery.isLoading && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Buscando resultados…
            </div>
          )}

          {previewQuery.data && (
            <>
              <div className="px-4 py-2 flex gap-2 text-[11px] shrink-0">
                <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 font-bold">
                  Detectados: {previewQuery.data.summary.found}
                </span>
                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-bold">
                  Sin datos: {previewQuery.data.summary.missing}
                </span>
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-bold">
                  Ya importados: {previewQuery.data.summary.alreadyImported}
                </span>
              </div>

              {previewQuery.data.errors?.length > 0 && (
                <div className="px-4 text-[10px] text-red-600 shrink-0">
                  Algunas fuentes fallaron: {previewQuery.data.errors.slice(0, 2).join(" · ")}
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-2">
                {(previewQuery.data.items || []).map((it: any) => {
                  const canSelect = !!it.scraped && !it.alreadyImported;
                  const checked = !!selectedImport[it.lotteryId];
                  return (
                    <label
                      key={it.lotteryId}
                      className={`block p-3 rounded-xl border ${
                        it.alreadyImported
                          ? "border-blue-100 bg-blue-50/50"
                          : it.scraped
                          ? "border-green-200 bg-white"
                          : "border-gray-100 bg-gray-50 opacity-70"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={checked}
                          onChange={() => toggleImportItem(it.lotteryId)}
                          className="mt-1 w-4 h-4 accent-green-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-gray-900">{it.lotteryName}</p>
                            {it.alreadyImported ? (
                              <span className="text-[10px] font-bold text-blue-600 flex items-center gap-0.5">
                                <CheckCircle size={12} /> Importado
                              </span>
                            ) : it.scraped ? (
                              <span className="text-[10px] font-bold text-green-600">Detectado</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">Sin datos</span>
                            )}
                          </div>
                          {it.scraped ? (
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              <div className="text-center py-1.5 bg-yellow-50 rounded-lg text-sm font-extrabold text-yellow-700">
                                {it.scraped.firstPrize}
                              </div>
                              <div className="text-center py-1.5 bg-gray-50 rounded-lg text-sm font-extrabold text-gray-800">
                                {it.scraped.secondPrize}
                              </div>
                              <div className="text-center py-1.5 bg-orange-50 rounded-lg text-sm font-extrabold text-orange-700">
                                {it.scraped.thirdPrize}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-400 mt-1">
                              Ingresa manualmente con el botón +
                            </p>
                          )}
                          {it.scraped && (
                            <p className="text-[9px] text-gray-400 mt-1 truncate">
                              Fuente: {it.scraped.sourceName} · {it.scraped.confidence}
                            </p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="p-4 border-t border-gray-100 shrink-0 space-y-2">
                <button
                  type="button"
                  onClick={selectAllImportable}
                  className="w-full py-2 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg"
                >
                  Seleccionar todos los detectados
                </button>
                <button
                  type="button"
                  disabled={importing || Object.values(selectedImport).filter(Boolean).length === 0}
                  onClick={handleImportConfirmed}
                  className="w-full py-3 rounded-xl bg-[var(--bv-primary)] text-white font-bold text-sm disabled:opacity-50"
                >
                  {importing
                    ? "Importando y calculando premios…"
                    : `Confirmar e importar (${Object.values(selectedImport).filter(Boolean).length})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
