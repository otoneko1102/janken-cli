import { Command } from "commander";
import WebSocket from "ws";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { consola } from "consola";
import { HANDS, judge } from "./janken.js";

export { judge };

export function showResult(myHand, opponentHand) {
  const result = judge(myHand, opponentHand);
  consola.log(
    `\nYou: ${myHand}  /  Opponent: ${opponentHand}`,
  );
  if (result === "draw") consola.info("Draw");
  else if (result === "win") consola.success("You win!");
  else consola.fail("You lose...");
}

const program = new Command();

program
  .name("Janken")
  .description("Janken for CLI")
  .option("--test", "test mode (no server needed)")
  .option(
    "--name <name>",
    "your display name shown to opponent",
  )
  .option("--host <url>", "WebSocket server URL")
  .option(
    "--config <path>",
    "path to config file (default: config.json)",
  )
  .action(async (options) => {
    if (options.test) {
      const hand = await promptHand();
      const cpuHand =
        HANDS[Math.floor(Math.random() * HANDS.length)];
      showResult(hand, cpuHand);
      return;
    }

    const configPath = resolve(
      process.cwd(),
      options.config ?? "config.json",
    );
    let config = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(
          readFileSync(configPath, "utf-8"),
        );
      } catch {
        consola.warn(
          "Failed to load config. Using default settings.",
        );
      }
    }

    const host =
      options.host ?? config.host ?? "ws://localhost:3000";
    const ws = new WebSocket(host);
    const playerName =
      options.name ?? config.name ?? "Anonymous";

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "join",
          name: playerName,
        }),
      );
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "waiting") {
        consola.info("Waiting for opponent...");
      }

      if (msg.type === "start") {
        consola.info(`Opponent: ${msg.opponent}`);
        promptHand().then((hand) => {
          ws.send(
            JSON.stringify({
              type: "choice",
              hand,
            }),
          );
        });
      }

      if (msg.type === "result") {
        showResult(msg.myHand, msg.opponentHand);
        ws.close();
      }
    });

    ws.on("error", (err) => {
      consola.error("Connection error:", err.message);
      process.exit(1);
    });
  });

program.parse();

async function promptHand() {
  return await consola.prompt("Choose your hand:", {
    type: "select",
    options: ["rock", "scissors", "paper"],
  });
}
