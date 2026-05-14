import { getStore } from "@netlify/blobs";

const KEY = "all-seats";

export default async (req) => {
  const store = getStore({ name: "poker-night", consistency: "strong" });

  try {
    if (req.method === "GET") {
      const seats = (await store.get(KEY, { type: "json" })) || {};
      return Response.json(seats, { headers: corsHeaders() });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { seatNum, name, cards, avatar, playerId, previousSeat } = body || {};

      if (!seatNum || !name || !Array.isArray(cards) || !playerId) {
        return new Response("Bad request", { status: 400, headers: corsHeaders() });
      }
      if (seatNum < 1 || seatNum > 8) {
        return new Response("Invalid seat", { status: 400, headers: corsHeaders() });
      }

      const seats = (await store.get(KEY, { type: "json" })) || {};

      // Free previous seat if this player is moving
      if (previousSeat && seats[previousSeat]?.playerId === playerId) {
        delete seats[previousSeat];
      }

      seats[seatNum] = {
        name: String(name).slice(0, 40),
        cards,
        avatar: avatar && typeof avatar === "object" ? avatar : null,
        playerId,
        claimedAt: Date.now(),
      };

      await store.setJSON(KEY, seats);
      return Response.json(seats, { headers: corsHeaders() });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const { seatNum, playerId } = body || {};
      const seats = (await store.get(KEY, { type: "json" })) || {};
      if (seats[seatNum]?.playerId === playerId) {
        delete seats[seatNum];
        await store.setJSON(KEY, seats);
      }
      return Response.json(seats, { headers: corsHeaders() });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const config = {
  path: "/api/seats",
};
