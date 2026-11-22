/**
 * Sonidos de notificación + integración con volumen del sistema.
 *
 * - En app web / en primer plano: se reproducen archivos MP3.
 *   El volumen sigue el volumen de MEDIOS del dispositivo (limitación del navegador).
 * - En Android (Capacitor) con Local Notifications: el sonido usa el
 *   stream de NOTIFICACIONES del sistema → respeta el volumen de notificaciones
 *   del celular.
 *
 * Preferencia de sonido guardada en localStorage: bv_notif_sound
 */

export type NotifSoundId = "ding" | "chime" | "alert" | "pop" | "success" | "silent";

export const NOTIF_SOUNDS: { id: NotifSoundId; label: string; file?: string; forType?: string }[] = [
  { id: "ding", label: "Ding clásico", file: "/sounds/ding.mp3" },
  { id: "chime", label: "Campanita suave", file: "/sounds/chime.mp3" },
  { id: "alert", label: "Alerta (ganador)", file: "/sounds/alert.mp3", forType: "ticket_ganador" },
  { id: "success", label: "Éxito / monedas", file: "/sounds/success.mp3" },
  { id: "pop", label: "Pop corto", file: "/sounds/pop.mp3" },
  { id: "silent", label: "Silencio (solo visual)" },
];

const STORAGE_KEY = "bv_notif_sound";
const STORAGE_ENABLED = "bv_notif_sound_enabled";

export function getPreferredSound(): NotifSoundId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as NotifSoundId | null;
    if (v && NOTIF_SOUNDS.some((s) => s.id === v)) return v;
  } catch {}
  return "chime";
}

export function setPreferredSound(id: NotifSoundId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

export function isSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_ENABLED);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_ENABLED, enabled ? "1" : "0");
  } catch {}
}

/** Detecta si estamos en Capacitor nativo */
export function isNativeApp(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Reproduce el sonido elegido.
 * En navegador/web: Audio HTML5 (volumen de medios).
 * En Capacitor: intenta Local Notifications (volumen de notificaciones del sistema).
 */
export async function playNotificationSound(opts?: {
  soundId?: NotifSoundId;
  type?: string; // ticket_ganador | ticket_anulado | sistema
  title?: string;
  body?: string;
}): Promise<void> {
  if (!isSoundEnabled()) return;

  let soundId = opts?.soundId || getPreferredSound();

  // Si es ganador y el usuario no forzó otro, priorizar alert
  if (opts?.type === "ticket_ganador" && !opts?.soundId && soundId === "chime") {
    soundId = "alert";
  }

  if (soundId === "silent") return;

  const entry = NOTIF_SOUNDS.find((s) => s.id === soundId);
  const file = entry?.file;
  if (!file) return;

  // Intentar notificaciones nativas de Capacitor (volumen de NOTIFICACIONES del SO)
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import(
        /* @vite-ignore */ "@capacitor/local-notifications"
      ).catch(() => ({ LocalNotifications: null as any }));

      if (LocalNotifications) {
        // Pedir permisos si hace falta
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== "granted") {
          await LocalNotifications.requestPermissions();
        }

        // Canal Android con sonido (respeta volumen de notificaciones)
        try {
          await LocalNotifications.createChannel({
            id: "banca_victoria_alerts",
            name: "Alertas Banca Victoria",
            description: "Tickets ganadores y avisos",
            importance: 5, // HIGH
            sound: soundId, // nombre sin extensión si está en res/raw; fallback abajo
            visibility: 1,
            vibration: true,
          });
        } catch {
          // canal ya existe o no soportado
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              id: Date.now() % 100000,
              title: opts?.title || "Banca Victoria",
              body: opts?.body || "Nueva notificación",
              channelId: "banca_victoria_alerts",
              sound: soundId,
            },
          ],
        });
        // También reproducir in-app por si el usuario tiene la app abierta
        // (algunos dispositivos no repiten el sonido del sistema si la app está en foreground)
      }
    } catch {
      // Plugin no instalado → fallback web
    }
  }

  // Fallback / in-app: HTML5 Audio
  // Nota: en Android Chrome/WebView el volumen es el de MEDIOS, no el de notificaciones.
  // Solo las Local Notifications nativas usan el volumen de notificaciones del sistema.
  try {
    const audio = new Audio(file);
    audio.volume = 1.0; // máximo relativo; el SO aplica el volumen de medios
    await audio.play();
  } catch (e) {
    // Autoplay bloqueado hasta interacción del usuario — silencioso
    console.warn("[notif-sound] no se pudo reproducir:", e);
  }
}

/** Vista previa del sonido (desde Ajustes) */
export async function previewSound(id: NotifSoundId) {
  if (id === "silent") return;
  const entry = NOTIF_SOUNDS.find((s) => s.id === id);
  if (!entry?.file) return;
  try {
    const audio = new Audio(entry.file);
    audio.volume = 1.0;
    await audio.play();
  } catch {}
}
