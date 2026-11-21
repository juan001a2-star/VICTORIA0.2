import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { formatMoney } from "@/store";
import { Bell, Search, ClipboardList, Activity, CheckCheck } from "lucide-react";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function AccountingMonitoringScreen({ user }: { user: any }) {
  const [tab, setTab] = useState<"monitor" | "tickets" | "notifications">("monitor");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [view, setView] = useState<"general" | "group" | "seller">("general");
  const [userId, setUserId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<"count" | "amount" | "number">("count");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "winner" | "paid">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const monitoring = trpc.accounting.monitoring.useQuery({
    from, to, view, ...(userId ? { userId: Number(userId) } : {}),
    ...(groupId ? { groupId: Number(groupId) } : {}),
  }, { enabled: from <= to });
  const tickets = trpc.accounting.tickets.useQuery({ from, to, status, ...(userId ? { userId: Number(userId) } : {}), ...(search ? { search } : {}) }, { enabled: from <= to });
  const notices = trpc.accounting.notificationList.useQuery(undefined, { enabled: tab === "notifications" });
  const unread = trpc.accounting.unreadCount.useQuery();
  const markRead = trpc.accounting.markRead.useMutation({ onSuccess: () => { utils.accounting.notificationList.invalidate(); utils.accounting.unreadCount.invalidate(); } });
  const detail = trpc.ticket.withPlays.useQuery({ id: selected || 0 }, { enabled: selected !== null });
  const data = monitoring.data;
  const details = useMemo(() => (data?.details || []).filter((r: any) => !type || r.type === type).sort((a: any,b: any) =>
    sort === "count" ? b.count-a.count : sort === "amount" ? b.amount-a.amount : a.number.localeCompare(b.number, undefined, { numeric: true })
  ), [data, type, sort]);
  const money = (n: number) => `$${formatMoney(n || 0)}`;
  const label: Record<string,string> = { directo: "Directo", pale: "Palé", tripleta: "Tripleta", tres_cifras: "Tres cifras", cuatro_cifras: "Cuatro cifras" };
  const statusLabel: Record<string,string> = { active: "Activo", cancelled: "Anulado", winner: "Ganador", paid: "Pagado" };
  return <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
    <div>
      <h2 className="text-xl font-bold text-gray-900">Contabilidad y monitoreo</h2>
      <p className="text-xs text-gray-500 mt-1">Ventas, jugadas, tickets y avisos de la banca</p>
    </div>
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
      {([["monitor","Monitoreo",Activity],["tickets","Tickets",ClipboardList],["notifications","Avisos",Bell]] as const).map(([id,title,Icon]) =>
        <button key={id} onClick={() => setTab(id)} className={`rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1 ${tab===id ? "bg-white text-green-800 shadow-sm" : "text-gray-600"}`}><Icon size={14}/>{title}{id==="notifications" && (unread.data||0)>0 ? ` (${unread.data})` : ""}</button>
      )}
    </div>
    {tab !== "notifications" && <div className="bg-white border rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
        <label className="text-xs text-gray-600">Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
      </div>
      <select value={userId} onChange={e=>setUserId(e.target.value)} className="w-full border rounded-lg p-2 text-sm"><option value="">Todos los vendedores</option>{(data?.sellers||[]).map((u:any)=><option key={u.id} value={u.id}>{u.name} ({u.bankNumber})</option>)}</select>
      {user.role === "admin" && <select value={groupId} onChange={e=>setGroupId(e.target.value)} className="w-full border rounded-lg p-2 text-sm"><option value="">Todos los grupos</option>{(data?.groups||[]).map((g:any)=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
      <div className="flex gap-2">
        <select value={view} onChange={e=>setView(e.target.value as any)} className="flex-1 border rounded-lg p-2 text-xs"><option value="general">Vista general</option><option value="group">Por grupo</option><option value="seller">Por vendedor</option></select>
        {from > to && <span className="text-xs text-red-600 self-center">Rango inválido</span>}
      </div>
    </div>}
    {tab === "monitor" && <>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Total vendido", data?.summary.sales || 0],
          ["Tickets", data?.summary.tickets || 0],
          ["Comisiones", data?.summary.commissions || 0],
          ["Premios", data?.summary.prizes || 0],
        ].map(([title,value]:any)=><div key={title} className="rounded-xl border bg-white p-3"><p className="text-xs text-gray-500">{title}</p><p className="text-lg font-extrabold text-gray-900">{title==="Tickets" ? value : money(value)}</p></div>)}
      </div>
      {view !== "general" && <section className="bg-white border rounded-xl overflow-hidden">
        <h3 className="p-3 font-bold text-sm">{view === "seller" ? "Resumen por vendedor" : "Resumen por grupo"}</h3>
        {(view === "seller" ? (data?.bySeller || []) : (data?.byGroup || [])).map((r:any)=><div key={view === "seller" ? r.userId : r.groupId} className="border-t p-3"><div className="flex justify-between gap-2"><b className="text-xs">{r.name}</b><b className="text-xs">{money(r.sales)}</b></div><p className="text-[10px] text-gray-500 mt-1">{r.tickets} tickets · Comisión {money(r.commissions)} · Premios {money(r.prizes)}</p></div>)}
        {!(view === "seller" ? data?.bySeller?.length : data?.byGroup?.length) && <p className="p-4 text-center text-xs text-gray-400">Sin datos para este periodo.</p>}
      </section>}
      <section className="bg-white border rounded-xl overflow-hidden">
        <h3 className="p-3 font-bold text-sm">Ventas por tipo de jugada</h3>
        {(data?.byType||[]).map((r:any)=><button key={r.type} onClick={()=>setType(type===r.type?"":r.type)} className={`w-full flex justify-between items-center px-3 py-3 border-t text-sm ${type===r.type?"bg-green-50":""}`}><span>{label[r.type]||r.type}</span><span className="font-semibold">{r.count} · {money(r.amount)}</span></button>)}
        {!data?.byType?.length && <p className="p-4 text-center text-xs text-gray-400">No hay jugadas en este periodo.</p>}
      </section>
      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-3 flex items-center justify-between gap-2"><h3 className="font-bold text-sm">{type ? `Detalle: ${label[type]||type}` : "Detalle de combinaciones"}</h3><select value={sort} onChange={e=>setSort(e.target.value as any)} className="border rounded-lg p-1.5 text-xs"><option value="count">Cantidad</option><option value="amount">Monto</option><option value="number">Número</option></select></div>
        {details.map((r:any)=><div key={`${r.type}-${r.number}`} className="px-3 py-2 border-t flex justify-between text-xs"><span className="font-semibold">{r.number}</span><span>{r.count} jugadas</span><span className="font-bold">{money(r.amount)}</span></div>)}
        {details.length>0 && <div className="p-3 border-t bg-gray-50 flex justify-between text-xs font-bold"><span>TOTAL</span><span>{details.reduce((s:number,r:any)=>s+r.count,0)} jugadas · {money(details.reduce((s:number,r:any)=>s+r.amount,0))}</span></div>}
      </section>
    </>}
    {tab === "tickets" && <>
      <div className="flex gap-2"><select value={status} onChange={e=>setStatus(e.target.value as any)} className="border rounded-lg p-2 text-xs"><option value="all">Todos los estados</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><div className="flex-1 relative"><Search size={14} className="absolute left-2 top-2.5 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar ticket" className="w-full border rounded-lg py-2 pl-7 pr-2 text-xs"/></div></div>
      <div className="space-y-2">{(tickets.data||[]).map((tk:any)=><button key={tk.id} onClick={()=>setSelected(tk.id)} className="w-full text-left bg-white border rounded-xl p-3"><div className="flex justify-between"><b className="text-sm">{tk.code}</b><span className="text-xs">{statusLabel[tk.status]||tk.status}</span></div><p className="text-xs text-gray-500 mt-1">{tk.sellerName} · {new Date(tk.createdAt).toLocaleString()}</p><p className="font-bold text-sm mt-1">{money(Number(tk.total))}</p>{tk.annulReason && <p className="text-xs text-red-600 mt-1">Motivo: {tk.annulReason}</p>}</button>)}</div>
      {!tickets.data?.length && <p className="text-center text-xs text-gray-400 py-6">No se encontraron tickets.</p>}
    </>}
    {tab === "notifications" && <section className="bg-white border rounded-xl overflow-hidden">
      <div className="p-3 flex items-center justify-between"><h3 className="font-bold text-sm">Notificaciones</h3><button onClick={()=>markRead.mutate({all:true})} className="text-xs text-green-700 font-bold flex items-center gap-1"><CheckCheck size={14}/>Marcar todas leídas</button></div>
      {(notices.data||[]).map((n:any)=><button key={n.id} onClick={()=>{markRead.mutate({id:n.id});if(n.ticketId){setSelected(n.ticketId);setTab("tickets");}}} className={`w-full text-left border-t p-3 ${n.read?"bg-white":"bg-amber-50"}`}><p className="text-sm font-bold">{n.title}</p><p className="text-xs text-gray-600 mt-1">{n.message}</p><p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p></button>)}
      {!notices.data?.length && <p className="p-5 text-center text-xs text-gray-400">No tienes notificaciones.</p>}
    </section>}
    {selected !== null && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={()=>setSelected(null)}><div className="bg-white rounded-2xl p-4 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center"><h3 className="font-bold">Detalle del ticket</h3><button onClick={()=>setSelected(null)}>Cerrar</button></div>{detail.data?.ticket && <><p className="text-sm font-bold mt-3">{detail.data.ticket.code} · {money(Number(detail.data.ticket.total))}</p><p className="text-xs text-gray-500">{statusLabel[detail.data.ticket.status]||detail.data.ticket.status}</p>{detail.data.plays.map((p:any)=><div key={p.id} className="flex justify-between border-t py-2 text-xs"><span>{p.number} ({label[p.type]||p.type})</span><b>{money(Number(p.amount))}</b></div>)}{detail.data.ticket.annulReason && <div className="mt-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><p className="font-bold">Ticket anulado</p><p>Motivo: {detail.data.ticket.annulReason}</p><p>Fecha: {detail.data.ticket.annulledAt ? new Date(detail.data.ticket.annulledAt).toLocaleString() : "—"}</p><p>Anulado por ID: {detail.data.ticket.annulledBy ?? "—"}</p></div>}</>}</div></div>}
  </div>;
}
