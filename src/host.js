import { Command } from "commander";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { consola } from "consola";
import { judge, buildResultMessages } from "./janken.js";

export { judge };

const app = new Hono();
app.get("/", (c) => c.text("janken-cli server running"));

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
        const { r1, r2, msg1, msg2 } = buildResultMessages(
          choices[p1.playerName],
          choices[p2.playerName],
        );
        consola.success(
          `[result] ${p1.playerName}=${r1}, ${p2.playerName}=${r2}`,
        );
        p1.send(msg1);
        p2.send(msg2);
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
