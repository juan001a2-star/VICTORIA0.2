import { Bell, CheckCheck, Trophy, Ban, Info, ChevronLeft } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { SessionUser } from "@/store";

interface NotificacionesScreenProps {
  user: SessionUser;
  onBack?: () => void;
  onOpenTicket?: (ticketId: number) => void;
}

function typeStyle(type: string) {
  if (type === "ticket_ganador") {
    return {
      icon: Trophy,
      bg: "bg-amber-50",
      border: "border-amber-200",
      iconColor: "text-amber-600",
      badge: "bg-amber-100 text-amber-800",
      label: "Ganador",
    };
  }
  if (type === "ticket_anulado") {
    return {
      icon: Ban,
      bg: "bg-red-50",
      border: "border-red-200",
      iconColor: "text-red-600",
      badge: "bg-red-100 text-red-700",
      label: "Anulado",
    };
  }
  return {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    label: "Sistema",
  };
}

function formatWhen(d: string | Date) {
  try {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60_000) return "Ahora";
    if (diff < 3600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
    if (diff < 86400_000) return `Hace ${Math.floor(diff / 3600_000)} h`;
    return date.toLocaleString("es", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function NotificacionesScreen({ user, onBack, onOpenTicket }: NotificacionesScreenProps) {
  const utils = trpc.useUtils();
  const listQ = trpc.notification.list.useQuery({ limit: 80 });
  const markReadMut = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });
  const markAllMut = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const items = listQ.data || [];
  const unread = items.filter((n: any) => !n.read).length;

  const handleTap = (n: any) => {
    if (!n.read) {
      markReadMut.mutate({ id: n.id });
    }
    if (n.ticketId && onOpenTicket) {
      onOpenTicket(n.ticketId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--bv-primary)] to-green-800 text-white px-4 pt-4 pb-5">
        <div className="flex items-center gap-2 mb-1">
          {onBack && (
            <button onClick={onBack} className="p-1.5 -ml-1 rounded-lg hover:bg-white/20">
              <ChevronLeft size={22} />
            </button>
          )}
          <Bell size={22} />
          <h1 className="text-lg font-bold">Notificaciones</h1>
        </div>
        <p className="text-green-100 text-xs">
          {unread > 0 ? `${unread} sin leer` : "Todas leídas"}
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {unread > 0 && (
          <button
            onClick={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-[var(--bv-primary-dark)] shadow-sm hover:bg-green-50"
          >
            <CheckCheck size={16} />
            Marcar todas como leídas
          </button>
        )}

        {listQ.isLoading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <Bell size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">No tienes notificaciones</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n: any) => {
              const st = typeStyle(n.type);
              const Icon = st.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className={`w-full text-left rounded-2xl border p-3.5 shadow-sm transition-colors ${
                    n.read ? "bg-white border-gray-100" : `${st.bg} ${st.border}`
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${n.read ? "bg-gray-100" : "bg-white/80"}`}>
                      <Icon size={18} className={st.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-bold ${n.read ? "text-gray-700" : "text-gray-900"}`}>
                          {!n.read && <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle" />}
                          {n.title}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${st.badge}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{formatWhen(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
