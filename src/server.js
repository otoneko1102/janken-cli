import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import {
  readFileSync,
  existsSync,
} from "fs";
import { resolve } from "path";
import { consola } from "consola";

const configPath = resolve(
  process.cwd(),
  "config.json",
);
let config = { port: 3000 };
if (existsSync(configPath)) {
  try {
    config = JSON.parse(
      readFileSync(configPath, "utf-8"),
    );
  } catch {
    consola.warn(
      "Failed to load config.json. Using default settings.",
    );
  }
}

const app = new Hono();
app.get("/", (c) =>
  c.text("chaos-janken server running"),
);

// rock: 0 / scissors: 1 / paper: 2
const HANDS = [
  "rock",
  "scissors",
  "paper",
];

function judge(a, b) {
  if (a === b) return "draw";
  return (HANDS.indexOf(a) -
    HANDS.indexOf(b) +
    3) %
    3 ===
    2
    ? "win"
    : "lose";
}

const waiting = [];
let playerCount = 0;

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    consola.start(
      `janken server: http://localhost:${info.port}`,
    );
  },
);

const wss = new WebSocketServer({
  server,
});

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(
      raw.toString(),
    );
    if (msg.type === "join") {
      ws.playerName = `Player${++playerCount}`;
      waiting.push(ws);
      consola.info(
        `[join] ${msg.name} (waiting: ${waiting.length})`,
      );
      if (waiting.length >= 2) {
        const p1 = waiting.shift();
        const p2 = waiting.shift();
        startMatch(p1, p2);
      } else {
        ws.send(
          JSON.stringify({
            type: "waiting",
          }),
        );
      }
    }
  });
});

function startMatch(p1, p2) {
  consola.info(
    `[match] ${p1.playerName} vs ${p2.playerName}`,
  );
  const choices = {};

  p1.send(
    JSON.stringify({
      type: "start",
      opponent: p2.playerName,
    }),
  );
  p2.send(
    JSON.stringify({
      type: "start",
      opponent: p1.playerName,
    }),
  );

  function onMessage(player, raw) {
    const msg = JSON.parse(
      raw.toString(),
    );
    if (
      msg.type === "choice" &&
      !choices[player.playerName]
    ) {
      choices[player.playerName] =
        msg.hand;
      consola.log(
        `[choice] ${player.playerName}: ${msg.hand}`,
      );

      if (
        choices[p1.playerName] &&
        choices[p2.playerName]
      ) {
        const r1 = judge(
          choices[p1.playerName],
          choices[p2.playerName],
        );
        const r2 =
          r1 === "draw"
            ? "draw"
            : r1 === "win"
              ? "lose"
              : "win";
        consola.success(
          `[result] ${p1.playerName}=${r1}, ${p2.playerName}=${r2}`,
        );
        p1.send(
          JSON.stringify({
            type: "result",
            result: r1,
            myHand:
              choices[p1.playerName],
            opponentHand:
              choices[p2.playerName],
          }),
        );
        p2.send(
          JSON.stringify({
            type: "result",
            result: r2,
            myHand:
              choices[p2.playerName],
            opponentHand:
              choices[p1.playerName],
          }),
        );
      }
    }
  }

  p1.on("message", (raw) =>
    onMessage(p1, raw),
  );
  p2.on("message", (raw) =>
    onMessage(p2, raw),
  );
}
