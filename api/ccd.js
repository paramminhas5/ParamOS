// Cats Can Dance lane. Read-only: calls the ops_snapshot function the CCD site already uses and returns a safe summary.
// No emails, messages or signups leave this file. Needs CCD_OPS_TOKEN in this Vercel project's environment variables.
const URL_ = process.env.CCD_SUPABASE_URL || "https://jybloszaucgqlbkzquqw.supabase.co";
// public anon key (it ships in the CCD site's own bundle); override with CCD_ANON_KEY if it ever rotates
const KEY = process.env.CCD_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Ymxvc3phdWNncWxia3pxdXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTQxNzQsImV4cCI6MjA5Nzk5MDE3NH0.-275P8ge_PpCghp4cEzQlIQOw5FQyxRdbvw57YDoQoU";

function summarize(raw) {
  const c = raw.counts || {}, runs = raw.runs || [], build = raw.build || [];
  const last = {};
  for (const r of runs) if (!last[r.job]) last[r.job] = r;
  const failed = Object.entries(last).filter(([, r]) => r.ok === false).map(([job, r]) => ({ job, at: r.started_at, error: String(r.error || "").slice(0, 120) }));
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const upcoming = (raw.ccd_events || []).filter((e) => e.published && (e.event_date || "9999") >= today).slice(0, 5)
    .map((e) => ({ title: e.title, date: e.event_date || e.date, venue: e.venue }));
  const open = build.filter((b) => b.status === "in_progress" || b.status === "blocked").slice(0, 6).map((b) => ({ area: b.area, title: b.title, status: b.status }));
  const needs = [];
  if (c.pending) needs.push(`${c.pending} scraped events waiting for you to publish or skip`);
  for (const f of failed) needs.push(`Job ${f.job} failed on its last run`);
  for (const b of open) if (b.status === "blocked") needs.push(`Blocked: ${b.title}`);
  return { status: "ok", updated: new Date().toISOString(), counts: c, upcoming, jobs: Object.entries(last).map(([job, r]) => ({ job, ok: r.ok, at: r.started_at })), failed, build: open, needs_you: needs };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (!process.env.CCD_OPS_TOKEN) return res.status(200).json({ status: "not configured", hint: "add CCD_OPS_TOKEN to the paramos Vercel project" });
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/ops_snapshot`, {
      method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: process.env.CCD_OPS_TOKEN }),
    });
    if (!r.ok) return res.status(200).json({ status: "error", error: `supabase ${r.status}` });
    return res.status(200).json(summarize(await r.json()));
  } catch (e) { return res.status(200).json({ status: "error", error: e.name }); }
};
module.exports.summarize = summarize;
