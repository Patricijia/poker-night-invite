import { getStore } from "@netlify/blobs";

const KEY = "all-seats";

export default async (req) => {
  const store = getStore("poker-night");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (req.method === "GET") {
      const seats = (await store.get(KEY, { type: "json" })) || {};
      return Response.json(seats, {
        headers: corsHeaders(),
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { seatNum, name, cards, avatar, playerId, previousSeat } = body || {};

      const seatNumber = Number(seatNum);

      if (
        !Number.isInteger(seatNumber) ||
        seatNumber < 1 ||
        seatNumber > 8 ||
        !name ||
        !Array.isArray(cards) ||
        !playerId
      ) {
        return new Response("Bad request", {
          status: 400,
          headers: corsHeaders(),
        });
      }

      const seatKey = String(seatNumber);
      const previousSeatKey = previousSeat ? String(previousSeat) : null;

      const seats = (await store.get(KEY, { type: "json" })) || {};

      // If this player was already sitting somewhere else, remove old seat.
      if (previousSeatKey && seats[previousSeatKey]?.playerId === playerId) {
        delete seats[previousSeatKey];
      }

      seats[seatKey] = {
        name: String(name).slice(0, 40),
        cards,
        avatar: avatar && typeof avatar === "object" ? avatar : null,
        playerId: String(playerId),
        claimedAt: Date.now(),
      };

      await store.setJSON(KEY, seats);

      return Response.json(seats, {
        headers: corsHeaders(),
      });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const { seatNum, playerId } = body || {};

      const seatKey = String(seatNum);
      const seats = (await store.get(KEY, { type: "json" })) || {};

      if (seats[seatKey]?.playerId === String(playerId)) {
        delete seats[seatKey];
        await store.setJSON(KEY, seats);
      }

      return Response.json(seats, {
        headers: corsHeaders(),
      });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders(),
    });
  } catch (err) {
    console.error(err);

    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: corsHeaders(),
    });
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