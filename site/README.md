# NoFetch landing page

Serve from the repository root so the static page can be opened at `/site/`:

```sh
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173/site/`.

Run the source contract with `node --test site/landing.test.mjs`.
