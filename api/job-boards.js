// Free job-board check. Runs daily from a Vercel cron and on demand from the Param OS dashboard.
// Reads Companies (Job Search 2026), polls public Greenhouse / Ashby / Lever boards, adds new senior marketing
// roles to Roles, logs a Runs row and a Metrics row in Param OS. No AI involved.
const JOBS = "appuSXKcNmuc3ifVS", OS = "appVRRUkNDx089A4R";
const COMPANIES = "tblTaXOrOkEUKvhq9", ROLES = "tblCc5nyiCoFLiny8", RUNS = "tblHysNjC8p2sO6dy", METRICS = "tblvXBhpbXEhOWIRo";

const SENIOR = /\b(head|lead|director|vp|vice president|chief|cmo|founding|principal)\b/i;
const AREA = /\b(marketing|growth|brand|gtm|go[- ]to[- ]market|community|content|creative|developer (marketing|relations)|devrel|social|partnerships)\b/i;
const JUNIOR = /\b(intern|associate|executive|coordinator|specialist|assistant|junior)\b/i;
const PLACES = /india|bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|dubai|uae|abu dhabi|riyadh|saudi|singapore|remote|apac|asia/i;

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const at = (path, init = {}) =>
  fetch(`https://api.airtable.com/v0/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" } });

async function list(base, table, fields) {
  const out = [];
  let offset = "";
  do {
    const q = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    fields.forEach((f) => q.append("fields[]", f));
    if (offset) q.set("offset", offset);
    const r = await at(`${base}/${table}?${q}`);
    if (!r.ok) throw new Error(`airtable ${r.status}`);
    const j = await r.json();
    out.push(...(j.records || []));
    offset = j.offset || "";
  } while (offset);
  return out;
}
async function create(base, table, rows) {
  for (let i = 0; i < rows.length; i += 10) {
    const r = await at(`${base}/${table}`, { method: "POST", body: JSON.stringify({ typecast: true, records: rows.slice(i, i + 10).map((fields) => ({ fields })) }) });
    if (!r.ok) throw new Error(`airtable write ${r.status}`);
  }
}
const getJson = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "paramos" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

async function boardJobs(url) {
  const u = String(url).trim();
  let m = u.match(/greenhouse\.io\/(?:v1\/boards\/)?([\w-]+)/);
  if (m) return ((await getJson(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs`)).jobs || []).map((j) => [j.title, (j.location || {}).name || "", j.absolute_url]);
  m = u.match(/ashbyhq\.com\/(?:posting-api\/job-board\/)?([\w.-]+)/);
  if (m) return ((await getJson(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}`)).jobs || []).map((j) => [j.title, (j.location || "") + (j.isRemote ? " (Remote)" : ""), j.jobUrl]);
  m = u.match(/lever\.co\/(?:v0\/postings\/)?([\w-]+)/);
  if (m) return (await getJson(`https://api.lever.co/v0/postings/${m[1]}?mode=json`)).map((j) => [j.text, (j.categories || {}).location || "", j.hostedUrl]);
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.AIRTABLE_PAT) return res.status(503).json({ error: "not_configured" });
  try {
    const companies = await list(JOBS, COMPANIES, ["fldQdvsFMbPN1Z9wg", "fldlnr4DH0OzT07D5", "fld74XGE7y9itLV8G"]);
    const roles = await list(JOBS, ROLES, ["fldCRjEKZ0YqTAByM"]);
    const seen = new Set(roles.map((r) => String(r.fields.fldCRjEKZ0YqTAByM || "").replace(/\/$/, "")));
    const D = today();
    const found = [], unreadable = [], failed = [];
    let checked = 0;

    const work = companies.filter((c) => {
      const stage = c.fields.fldlnr4DH0OzT07D5;
      return (stage && stage.name ? stage.name : stage) !== "Closed / passed";
    });
    const pool = 8;
    let i = 0;
    await Promise.all(Array.from({ length: pool }, async () => {
      while (i < work.length) {
        const c = work[i++];
        const name = c.fields.fldQdvsFMbPN1Z9wg || "?";
        const board = c.fields.fld74XGE7y9itLV8G;
        if (!board) { unreadable.push(name); continue; }
        let jobs;
        try { jobs = await boardJobs(board); } catch (e) { failed.push(name); continue; }
        if (jobs === null) { unreadable.push(name); continue; }
        checked++;
        for (const [title, loc, link] of jobs) {
          const key = String(link || "").replace(/\/$/, "");
          if (!key || seen.has(key)) continue;
          if (!(SENIOR.test(title) && AREA.test(title)) || JUNIOR.test(title)) continue;
          if (loc && !PLACES.test(loc)) continue;
          seen.add(key);
          found.push({
            fld40ywu3g80CMb5x: title, fldez6rJReFsKL5iu: [c.id], fld55r7QKRpzwmNLQ: "New", fldCRjEKZ0YqTAByM: link,
            fld8PQiGVPoJ3hO2C: loc || "Unknown", fldW8L7twZStj1AdL: /remote/i.test(loc || "") ? "Remote" : "Unknown",
            fldoV4rkbvL79tdbl: D, fld4q0Bg5GBWJf6bd: "Role watcher", fldwHbI10Df0Wbpsf: `Found by the Param OS job board check on ${D}`,
          });
        }
      }
    }));

    if (found.length) await create(JOBS, ROLES, found);
    const summary = `${found.length} new roles from ${checked} boards. ` +
      (unreadable.length ? `No readable board (scout checks these): ${unreadable.slice(0, 15).join(", ")}. ` : "") +
      (failed.length ? `Failed: ${failed.join(", ")}.` : "");
    await create(OS, RUNS, [{ flduu1JyFZ3ggWRPh: `Job boards check ${D}`, fldISs8RuhDzR8N08: "Role watcher", fldh62EbF7Xulgbyv: D,
      fldnrXCkilf5P6qFt: failed.length ? "Partial" : "OK", fldVpxML2Kb3ma1Bx: summary, fldufc72HU9gacx7B: found.length }]);
    await create(OS, METRICS, [{ fldTpiIBBwSG3QoOw: "Roles found (script)", fldbD1MOfjOOsy5LZ: "Jobs", fld6znMmduCpFWAOT: found.length, fldC8NbGYxURRyiAt: D }]);
    return res.status(200).json({ ok: true, new: found.length, checked, unreadable: unreadable.length, failed: failed.length, summary });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
