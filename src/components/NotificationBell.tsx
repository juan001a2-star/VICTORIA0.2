import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { playNotificationSound } from "@/lib/notification-sounds";

interface NotificationBellProps {
  onOpen: () => void;
  /** Polling cada N ms para detectar nuevas (default 25s) */
  pollMs?: number;
}

export default function NotificationBell({ onOpen, pollMs = 25000 }: NotificationBellProps) {
  const utils = trpc.useUtils();
  const unreadQ = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: pollMs,
  });
  const count = unreadQ.data?.count ?? 0;
  const prevCount = useRef<number | null>(null);

  // Cuando sube el contador de no leídas → sonar
  useEffect(() => {
    if (prevCount.current === null) {
      prevCount.current = count;
      return;
    }
    if (count > prevCount.current) {
      playNotificationSound({
        type: "sistema",
        title: "Banca Victoria",
        body: "Tienes nuevas notificaciones",
      });
    }
    prevCount.current = count;
  }, [count]);

  // Refetch al volver a la pestaña
  useEffect(() => {
    const onFocus = () => {
      utils.notification.unreadCount.invalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [utils]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative p-2 hover:bg-white/20 rounded-lg transition-colors"
      aria-label="Notificaciones"
    >
      <Bell size={20} className="text-white" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--bv-primary)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
