import { auth } from "@/auth";
import { subscribe, type NotificationDTO } from "@/lib/notifications";

/**
 * SSE stream of the CURRENT user's notifications.
 *
 * MUST be Node.js runtime (EventEmitter + long-lived stream) and dynamic /
 * uncached. Only the session's own userId is subscribed — you cannot listen to
 * another user's channel. A heartbeat comment keeps proxies from killing the
 * idle connection.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* stream already closed — ignore */
        }
      };
      const sendEvent = (event: string, data: unknown) =>
        safeEnqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Initial hello so the client knows the stream is live.
      sendEvent("ready", { ok: true });

      // Push every notification emitted for this user.
      unsubscribe = subscribe(userId, (n: NotificationDTO) =>
        sendEvent("notification", n),
      );

      // Heartbeat comment line — keeps the connection alive through proxies.
      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), HEARTBEAT_MS);

      // Tear down promptly when the client disconnects.
      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx-style buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
