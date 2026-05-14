import { getStore } from "@netlify/blobs";

const KEY = "all-seats";
const STORE_NAME = "poker-night";

export default async (req) => {
  const store = getStore(STORE_NAME);

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (req.method === "GET") {
      const seats = (await store.get(KEY, { type: "json" })) || {};
      return json(seats);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const { seatNum, name, cards, avatar, playerId, previousSeat } = body || {};

      const seatNumber = Number(seatNum);
      if (
        !Number.isInteger(seatNumber) ||
        seatNumber < 1 ||
        seatNumber > 8 ||
        typeof name !== "string" ||
        name.trim().length === 0 ||
        !Array.isArray(cards) ||
        cards.length !== 2 ||
        !playerId
      ) {
        return new Response("Bad request", { status: 400, headers: corsHeaders() });
      }

      const seats = (await store.get(KEY, { type: "json" })) || {};
      const seatKey = String(seatNumber);
      const playerKey = String(playerId);

      // Remove this player from any previous seat. This is safer across devices
      // than trusting only the previousSeat value from localStorage.
      for (const [key, value] of Object.entries(seats)) {
        if (value?.playerId === playerKey && key !== seatKey) {
          delete seats[key];
        }
      }

      // Also honor previousSeat when present.
      if (previousSeat) {
        const previousSeatKey = String(previousSeat);
        if (seats[previousSeatKey]?.playerId === playerKey) {
          delete seats[previousSeatKey];
        }
      }

      seats[seatKey] = {
        name: name.trim().slice(0, 40),
        cards,
        avatar: avatar && typeof avatar === "object" ? avatar : null,
        playerId: playerKey,
        claimedAt: Date.now(),
      };

      await store.setJSON(KEY, seats);
      return json(seats);
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => null);
      const { seatNum, playerId } = body || {};
      const seatKey = String(seatNum);
      const playerKey = String(playerId);
      const seats = (await store.get(KEY, { type: "json" })) || {};

      if (seats[seatKey]?.playerId === playerKey) {
        delete seats[seatKey];
        await store.setJSON(KEY, seats);
      }

      return json(seats);
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  } catch (err) {
    console.error("Seats API error:", err);
    return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders() });
  }
};

function json(data) {
  return Response.json(data, { headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

export const config = {
  path: "/api/seats",
};
