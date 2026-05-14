# Fix applied

This version fixes remote seat storage for Netlify Blobs.

## What changed

- `netlify/functions/seats.mjs` stores seats with `store.setJSON()`.
- `script.js` no longer gets permanently stuck in local-only mode after one failed API request.
- `script.js` logs real API errors in the browser console.
- Added `netlify/functions/debug.mjs` at `/api/debug` to test Blob read/write.
- Added no-cache headers for API responses.

## After deploying

Open these URLs:

```txt
https://YOUR-SITE.netlify.app/api/debug
https://YOUR-SITE.netlify.app/api/seats
```

`/api/debug` should return `ok: true`.

`/api/seats` should return `{}` at first, then seat data after someone claims a seat.

If the website shows `Local`, the browser could not reach the Netlify function. Open DevTools → Console to see the exact error.
