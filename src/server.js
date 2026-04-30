import { Command } from "commander";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { consola } from "consola";

const app = new Hono();
app.get("/", (c) => c.text("janken-cli server running"));

// rock: 0 / scissors: 1 / paper: 2
const HANDS = ["rock", "scissors", "paper"];

export function judge(a, b) {
  if (a === b) return "draw";
  return (HANDS.indexOf(a) - HANDS.indexOf(b) + 3) % 3 === 2
    ? "win"
    : "lose";
}

const waiting = [];

export function startMatch(p1, p2) {
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
    const msg = JSON.parse(raw.toString());
    if (
      msg.type === "choice" &&
      !choices[player.playerName]
    ) {
      choices[player.playerName] = msg.hand;
      consola.log(
        `[choice] ${player.playerName}: ${msg.hand}`,
      );

      if (
        choices[p1.playerName] &&
        choices[p2.playerName]
      ) {
        const hand1 = choices[p1.playerName];
        const hand2 = choices[p2.playerName];
        const r1 = judge(hand1, hand2);
        const r2 =
          r1 === "draw"
            ? "draw"
            : r1 === "win"
              ? "lose"
              : "win";
        consola.success(
          `[result] ${p1.playerName}=${r1}, ${p2.playerName}=${r2}`,
        );
        if (r1 === "draw") {
          choices[p1.playerName] = null;
          choices[p2.playerName] = null;
          p1.send(
            JSON.stringify({
              type: "draw",
              myHand: hand1,
              opponentHand: hand2,
            }),
          );
          p2.send(
            JSON.stringify({
              type: "draw",
              myHand: hand2,
              opponentHand: hand1,
            }),
          );
        } else {
          p1.send(
            JSON.stringify({
              type: "result",
              result: r1,
              myHand: hand1,
              opponentHand: hand2,
            }),
          );
          p2.send(
            JSON.stringify({
              type: "result",
              result: r2,
              myHand: hand2,
              opponentHand: hand1,
            }),
          );
        }
      }
    }
  }

  p1.on("message", (raw) => onMessage(p1, raw));
  p2.on("message", (raw) => onMessage(p2, raw));
}

const program = new Command();

program
  .name("janken-server")
  .description("Janken WebSocket server")
  .option("--port <port>", "port to listen on", (v) =>
    parseInt(v, 10),
  )
  .option(
    "--config <path>",
    "path to config file (default: config.json)",
  )
  .action((options) => {
    const configPath = resolve(
      process.cwd(),
      options.config ?? "config.json",
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

    const port = options.port ?? config.port ?? 3000;

    const server = serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        consola.start(
          `janken server: http://localhost:${info.port}`,
        );
      },
    );

    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "join") {
          ws.playerName = msg.name || "Anonymous";
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
  });

program.parse();
