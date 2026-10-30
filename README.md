# ParamOS

Online copy of the daily dashboards. Lanes: Merman (music, pushed from Param's Mac), Cats Can Dance (`api/ccd.js`), The School (`api/school.js`).
`api/needs.js` merges every lane's needs-you list and warns when the Mac has not published for 2 days. The full map is in the Merman OS Claude project (param-os-system-map).
Secrets live only in Vercel environment variables: AIRTABLE_PAT, CCD_OPS_TOKEN, SCHOOL_URL, SCHOOL_ADMIN_PASSWORD.

`index.html` and `mermanos/state.json` are written by `crate daily` on Param's Mac and pushed here. Vercel redeploys on every push. Do not edit them by hand.

## Param OS app (`/app`)

The full Param OS dashboard, shown at paramminhas.com/paramos. It installs as a Mac app (Safari: File, Add to Dock), works offline from a saved copy, and queues edits made offline.

- `app/` holds the dashboard, service worker and manifest.
- `api/airtable.js` reads and writes the Param OS Airtable base. It needs `AIRTABLE_PAT` set in the Vercel project's environment variables.
- paramminhas.com maps `/paramos/*` to `/app/*` and `/paramos/api/*` to `/api/*` (see middleware.ts in parampokemon).
