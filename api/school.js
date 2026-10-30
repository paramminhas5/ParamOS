// The School (CCD.SCHOOL) lane. Read-only: calls the school's /api/ops/summary route and passes on counts only.
// Needs SCHOOL_URL (for example https://your-school-domain) and SCHOOL_ADMIN_PASSWORD in this Vercel project's environment variables.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  const base = process.env.SCHOOL_URL, pw = process.env.SCHOOL_ADMIN_PASSWORD;
  if (!base || !pw) return res.status(200).json({ status: "not configured", hint: "add SCHOOL_URL and SCHOOL_ADMIN_PASSWORD to the paramos Vercel project" });
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/api/ops/summary", { headers: { "x-admin-password": pw } });
    if (!r.ok) return res.status(200).json({ status: "error", error: `school ${r.status}` });
    const s = await r.json();
    const needs = [];
    if (s.gating_mode === "free") needs.push("Gating is set to free, so nothing is being charged");
    if (!s.users.new_7d) needs.push("No new learners in 7 days");
    return res.status(200).json({ status: "ok", updated: new Date().toISOString(), users: s.users, active_7d: s.active_7d, gating_mode: s.gating_mode, needs_you: needs });
  } catch (e) { return res.status(200).json({ status: "error", error: e.name }); }
};
