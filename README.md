# FretLab · Guitar Theory Workstation

Interactive fretboard, scales & modes, CAGED positions with connect-the-shapes
runs, chord library, diatonic progression builder, circle of fifths, and an
interval ear trainer. Web Audio synthesis, zero backend, single React component.

## Local dev

    npm install
    npm run dev

## Deploy — Option A: Netlify Drop (fastest)

`npm run build`, then drag the `dist/` folder onto https://app.netlify.com/drop
Done. (A pre-built `dist/` is included in this package.)

## Deploy — Option B: GitHub + Netlify (the proper way)

    git init && git add -A && git commit -m "FretLab v1.0"
    gh repo create fretlab --public --source=. --push

Then in Netlify: Add new site → Import from GitHub → pick `fretlab`.
Build command and publish dir are auto-detected from `netlify.toml`
(build: `npm run build`, publish: `dist`). Every push deploys.

## Deploy — Option C: Railway

Works too (New Project → Deploy from GitHub repo). Railway detects Vite;
it will serve via `npm run preview` or you can add a static file server.
Netlify is the better fit here since there's no backend.

## Roadmap

- Mic pitch detection (tuner + "play the interval" ear training)
- Metronome + tonic drone for modal practice
- localStorage persistence for progressions & ear stats
- Strudel pattern export from the progression builder
