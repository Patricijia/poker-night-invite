import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("poker-night");
    const key = "debug-test";
    const value = { ok: true, savedAt: new Date().toISOString() };

    await store.setJSON(key, value);
    const readBack = await store.get(key, { type: "json" });

    return Response.json({
      ok: true,
      message: "Netlify Blobs read/write works.",
      readBack,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Debug API error:", err);
    return Response.json({
      ok: false,
      error: err.message,
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

export const config = {
  path: "/api/debug",
};
