// Pure game logic – shared between Node.js (host.js / client.js)
// and Cloudflare Workers (host.cf.js) implementations.

// rock: 0 / scissors: 1 / paper: 2
export const HANDS = ["rock", "scissors", "paper"];

/**
 * Returns "win", "lose", or "draw" from player a's perspective.
 */
export function judge(a, b) {
  if (a === b) return "draw";
  return (HANDS.indexOf(a) - HANDS.indexOf(b) + 3) % 3 === 2
    ? "win"
    : "lose";
}

/**
 * Build both result messages for a completed match.
 *
 * @param {string} hand1 - hand of player 1
 * @param {string} hand2 - hand of player 2
 * @returns {{ r1: string, r2: string, msg1: string, msg2: string }}
 *   r1/r2 are the result strings for each player;
 *   msg1/msg2 are the serialised JSON strings ready to send.
 */
export function buildResultMessages(hand1, hand2) {
  const r1 = judge(hand1, hand2);
  const r2 =
    r1 === "draw" ? "draw" : r1 === "win" ? "lose" : "win";
  return {
    r1,
    r2,
    msg1: JSON.stringify({
      type: "result",
      result: r1,
      myHand: hand1,
      opponentHand: hand2,
    }),
    msg2: JSON.stringify({
      type: "result",
      result: r2,
      myHand: hand2,
      opponentHand: hand1,
    }),
  };
}
