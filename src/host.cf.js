import { Hono } from "hono";
import { buildResultMessages } from "./janken.js";

/**
 * Durable Object that manages a shared waiting queue and match state.
 *
 * Per-WebSocket state is stored via serializeAttachment() so it survives
 * DO hibernation between messages:
 *   { id, status: "pending"|"waiting"|"playing", playerName, opponentId, hand }
 */
export class JankenRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      id: crypto.randomUUID(),
      status: "pending",
      playerName: null,
      opponentId: null,
      hand: null,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Find a live WebSocket by its attachment id. */
  _getById(id) {
    return this.state
      .getWebSockets()
      .find((w) => w.deserializeAttachment()?.id === id);
  }

  webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const data = ws.deserializeAttachment();

    // join
    if (msg.type === "join" && data.status === "pending") {
      const playerName = msg.name || "Anonymous";

      const waitingWs = this.state
        .getWebSockets()
        .find(
          (w) =>
            w !== ws &&
            w.deserializeAttachment()?.status === "waiting",
        );

      if (waitingWs) {
        const waitingData = waitingWs.deserializeAttachment();

        ws.serializeAttachment({
          ...data,
          status: "playing",
          playerName,
          opponentId: waitingData.id,
          hand: null,
        });
        waitingWs.serializeAttachment({
          ...waitingData,
          status: "playing",
          opponentId: data.id,
          hand: null,
        });

        ws.send(
          JSON.stringify({
            type: "start",
            opponent: waitingData.playerName,
          }),
        );
        waitingWs.send(
          JSON.stringify({ type: "start", opponent: playerName }),
        );
      } else {
        ws.serializeAttachment({
          ...data,
          status: "waiting",
          playerName,
        });
        ws.send(JSON.stringify({ type: "waiting" }));
      }
    }

    // choice
    if (
      msg.type === "choice" &&
      data.status === "playing" &&
      data.hand === null
    ) {
      ws.serializeAttachment({ ...data, hand: msg.hand });

      const opponentWs = this._getById(data.opponentId);
      if (!opponentWs) return;

      const opponentData = opponentWs.deserializeAttachment();
      if (opponentData.hand === null) return; // opponent hasn't chosen yet

      const myHand = msg.hand;
      const opponentHand = opponentData.hand;
      const { msg1, msg2 } = buildResultMessages(myHand, opponentHand);

      ws.send(msg1);
      opponentWs.send(msg2);
    }
  }

  webSocketClose(ws) {
    const data = ws.deserializeAttachment();
    if (data?.opponentId) {
      const opponent = this._getById(data.opponentId);
      try {
        opponent?.close(1011, "Opponent disconnected");
      } catch {}
    }
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}

// Worker entrypoint
const app = new Hono();
app.get("/", (c) => c.text("janken-cli server running"));

export default {
  async fetch(request, env) {
    // Route WebSocket upgrades directly to the Durable Object
    if (request.headers.get("Upgrade") === "websocket") {
      const id = env.JANKEN_ROOM.idFromName("global");
      const room = env.JANKEN_ROOM.get(id);
      return room.fetch(request);
    }
    return app.fetch(request, env);
  },
};
