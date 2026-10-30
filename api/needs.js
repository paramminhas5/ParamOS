// One needs-you list for every lane, plus a stale-data alarm. Read-only. Lanes that are not configured are skipped quietly.
const fs = require("fs"), path = require("path");
const ccd = require("./ccd.js"), school = require("./school.js");

const call = (fn) => new Promise((resolve) => {
  const res = { setHeader() {}, status() { return res; }, json(b) { resolve(b); return res; } };
  Promise.resolve(fn({}, res)).catch(() => resolve(null));
});

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  const items = [], lanes = {};
  // Merman: state.json is pushed from the Mac. If it stops changing, say so first.
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "mermanos", "state.json"), "utf8"));
    const age = Math.floor((Date.now() - new Date(m.generated || m.date).getTime()) / 864e5);
    lanes.merman = { status: "ok", updated: m.generated || m.date, age_days: age };
    if (age >= 2) items.push({ lane: "Merman OS", text: `The Mac has not published for ${age} days. Open Merman OS or run git push in the ParamOS folder.`, urgent: true });
    for (const t of (m.today && m.today.needs_you) || []) items.push({ lane: "Merman OS", text: t });
  } catch { lanes.merman = { status: "missing" }; }
  const [c, s] = await Promise.all([call(ccd), call(school)]);
  for (const [name, label, d] of [["ccd", "Cats Can Dance", c], ["school", "The School", s]]) {
    lanes[name] = d ? { status: d.status } : { status: "error" };
    if (d && d.status === "ok") for (const t of d.needs_you || []) items.push({ lane: label, text: t });
    else if (d && d.status === "error") items.push({ lane: label, text: `Could not read this lane (${d.error}).`, urgent: true });
  }
  items.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
  res.status(200).json({ updated: new Date().toISOString(), count: items.length, items, lanes });
};
