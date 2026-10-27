const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
export const fill = (t, c) => (t || '').replace(/\{company\}/g, c.company).replace(/\{sender\}/g, c.sender);
export const fmtM = m => m.v.toFixed(m.t < 1 ? 2 : 1) + m.u;
export const pctM = m => Math.max(0, Math.min(1, (m.v - m.v0) / (m.t - m.v0)));

function promptFor(p, c, D) {
  const names = [...(p.halo || []).map(id => (D.HALO.find(h => h.id === id) || {}).name), ...(p.lines || []).map(id => (D.LINES.find(l => l.id === id) || {}).name)].filter(Boolean);
  const facts = p.facts.length ? p.facts.map(f => '- ' + f).join('\n') : '- none beyond the organisation name' + (p.note ? '; the user adds: ' + p.note : '');
  const system = `You write short, honest first-contact emails for ${c.company}, an early-stage environmental science company that works on halophytes (salt-tolerant plants) and on drones and ground robots for field monitoring. Field work is done by human crews today. Rules: use only the facts supplied about the recipient; never invent customers, results, statistics, named people or contact details; when you need a detail you were not given, write it as [verify: what to check]. 110 to 150 words, plain language, no hype, no exclamation marks, no bullet points. Structure: one sentence on who we are, one short paragraph on why this organisation, one concrete first step we propose, one question. Sign off with the sender name and company. Output exactly: SUBJECT: <subject>, a blank line, then the email body.`;
  const user = `Recipient: ${p.name} (${p.kind}, ${p.where}). Address it to: ${p.to}.\nFacts we can rely on:\n${facts}\nProposed focus: ${names.join('; ') || 'to be decided'}.\nSender: ${c.sender}, ${c.company}.` + (p.d.body ? `\nCurrent draft, for context only. Write a fresh version, not a paraphrase:\n${fill(p.d.subject, c)}\n${fill(p.d.body, c)}` : '');
  return { system, messages: [{ role: 'user', content: user }], max_tokens: 700 };
}

export class Engine {
  constructor(D, cfg, hooks, saved) {
    this.D = D; this.cfg = cfg; this.h = hooks;
    const sv = saved || {};
    this.agents = D.AGENTS.map(a => ({ ...a, paused: !!(sv.paused && sv.paused[a.id]), done: 0, blocked: false }));
    this.P = D.PROSPECTS.map(p => {
      const s = (sv.p && sv.p[p.id]) || null;
      const stage = s ? (s.stage === 'drafting' ? 'drafted' : s.stage) : (p.disc ? 'found' : 'hidden');
      return { ...p, stage, disc: stage !== 'hidden', d: (s && s.d) || { subject: p.subject, body: p.body, edited: false, ai: 0 } };
    });
    (sv.manual || []).forEach(m => this.P.push({ ...m, stage: m.stage === 'drafting' ? 'found' : m.stage }));
    this.lines = { ...(sv.lines || {}) };
    this.progs = D.PROGRAMS.map(p => ({ ...p, m: { ...p.m, v0: p.m.v }, runs: 0 }));
    this.jobs = D.JOBS.map(j => ({ ...j }));
    this.running = []; this.hist = []; this.feed = []; this.acc = { rnd: 16000, ops: 4000 };
    this.n = 0; this.ri = 0; this.ji = 0; this.fi = 0; this.wi = 0; this.paused = false;
    this.log('Runtime started. Eight agents run in parallel lanes.', 'System', 'sys');
  }
  log(msg, who, kind) { this.feed.unshift({ t: Date.now(), msg, who, kind: kind || 'sim' }); if (this.feed.length > 40) this.feed.length = 40; }
  byId(id) { return this.P.find(p => p.id === id); }
  isOn(id) { return this.lines[id] !== false; }
  start() { this.iv = setInterval(() => this.tick(), 450); this.tick(); }
  stop() { clearInterval(this.iv); this.running.forEach(r => clearTimeout(r.to)); }
  shares() {
    const now = Date.now(); let r = this.acc.rnd, o = this.acc.ops;
    for (const t of this.running) { if (t.lane === 'rnd') r += now - t.s; else o += now - t.s; }
    return { rnd: r / (r + o), ops: o / (r + o) };
  }
  allowed(lane) {
    const tgt = this.cfg().rnd / 100, sh = this.shares(), over = sh.rnd >= tgt + 0.02;
    if (lane === 'rnd') return over ? 'budget' : true;
    if (sh.ops >= (1 - tgt) + 0.02) return 'budget';
    if (over || !this.agents.some(a => a.lane === 'rnd' && !a.paused)) return true;
    const rr = this.running.filter(t => t.lane === 'rnd').length, or = this.running.filter(t => t.lane === 'ops').length;
    return or + 1 <= ((1 - tgt) / tgt) * rr ? true : 'wait';
  }
  tick() {
    const c = this.cfg();
    if (!this.paused) {
      const order = [...this.agents].sort((x, y) => (x.lane === 'rnd' ? 0 : 1) - (y.lane === 'rnd' ? 0 : 1));
      for (const a of order) {
        a.blocked = false;
        if (a.paused || this.running.length >= c.max) continue;
        if (this.running.filter(t => t.a === a.id).length >= a.cap) continue;
        const ok = this.allowed(a.lane); if (ok !== true) { a.blocked = ok; continue; }
        if (Math.random() < (a.lane === 'rnd' ? 0.8 : 0.55)) { const t = this.make(a); if (t) this.launch(a, t); }
      }
    }
    const cut = Date.now() - 125000;
    this.hist = this.hist.filter(h => h.e > cut);
    this.h.change();
  }
  launch(a, t) {
    const dur = t.dur / this.cfg().tempo;
    const r = { id: ++this.n, a: a.id, lane: a.lane, title: t.title, s: Date.now(), dur, live: false };
    this.running.push(r);
    r.to = setTimeout(() => this.finish(r, t), dur);
  }
  finish(r, t) {
    if (!this.running.includes(r)) return;
    this.running = this.running.filter(x => x !== r);
    const e = Date.now();
    this.hist.push({ a: r.a, lane: r.lane, s: r.s, e, title: r.title });
    this.acc[r.lane] += e - r.s;
    this.agents.find(x => x.id === r.a).done++;
    try { t.done && t.done(); } catch (err) { console.warn(err); }
    this.h.change();
  }
  real(agentId, title, fn) {
    const a = this.agents.find(x => x.id === agentId);
    const r = { id: ++this.n, a: a.id, lane: a.lane, title, s: Date.now(), dur: 0, live: true };
    this.running.push(r);
    const end = () => this.finish(r, {});
    return fn().then(v => { end(); return v; }, e => { end(); throw e; });
  }
  improve(pr) { const m = pr.m; m.v = m.v + (m.t - m.v) * rnd(0.03, 0.08); }
  make(a) {
    const D = this.D;
    if (a.id === 'scout') {
      const hid = this.P.filter(p => p.stage === 'hidden' && !p._lock && (!p.lines.length || p.lines.some(l => this.isOn(l))));
      if (hid.length && Math.random() < 0.85) {
        const p = hid[0]; p._lock = true;
        return { title: 'Screening ' + p.name, dur: rnd(3500, 6500), done: () => { p._lock = false; p.stage = 'found'; p.disc = true; this.log(`Found ${p.name} (${p.where})`, 'Scout'); this.h.persist(); } };
      }
      return { title: 'Scanning ' + D.REGIONS[this.ri++ % D.REGIONS.length], dur: rnd(4000, 8000) };
    }
    if (a.id === 'drafter') {
      const p = this.P.find(x => x.stage === 'found' && !x._lock && !x._busy);
      if (!p) return null;
      if (p.user && !p.d.body) { this.regenerate(p.id); return null; }
      p._lock = true;
      return { title: 'Preparing draft for ' + p.name, dur: rnd(3000, 5000), done: () => { p._lock = false; p.stage = 'drafted'; this.log('Draft ready for ' + p.name, 'Drafter'); this.h.persist(); } };
    }
    if (a.id === 'funder') {
      const g = pick(D.FUNDERS), pr = pick(this.progs);
      return { title: `Matching ${pr.name} to ${g}`, dur: rnd(5000, 9000), done: () => { if (++this.fi % 4 === 0) this.log(`Added ${g} to the watchlist for ${pr.name}`, 'Funder'); } };
    }
    if (a.id === 'watcher') {
      const t = D.WATCH[this.wi++ % D.WATCH.length];
      return { title: 'Reviewing ' + t, dur: rnd(5000, 9000), done: () => { if (this.wi % 3 === 0) this.log('Queued a review of ' + t, 'Watcher'); } };
    }
    if (a.id === 'dispatch') {
      const job = pick(this.jobs.filter(x => !x._lock));
      if (!job) return null;
      job._lock = true;
      const verbs = ['Assigning crew to', 'Sending crew to', 'Collecting data from', 'Closing out'];
      return {
        title: verbs[job.st] + ' ' + job.title, dur: rnd(4500, 8500), done: () => {
          job._lock = false;
          if (job.st < 3) { job.st++; if (job.st > 1) this.log(`${job.title}: ${job.st === 2 ? 'crew in the field' : 'data received'} (${job.ex})`, 'Dispatcher'); }
          else { const nx = D.JOB_NEXT[this.ji++ % D.JOB_NEXT.length]; job.title = nx[0]; job.site = nx[1]; job.ex = nx[2]; job.st = 0; }
        },
      };
    }
    if (a.lane === 'rnd') {
      const ex = pick(D.EXPS[a.id]), pr = this.progs.find(p => p.id === ex[0]);
      return {
        title: ex[1], dur: rnd(6000, 14000), done: () => {
          this.improve(pr); pr.runs++;
          if (Math.random() < 0.55) this.log(`${pr.name}: ${ex[1]} finished. ${pr.m.label} is now ${fmtM(pr.m)}.`, a.name);
        },
      };
    }
    return null;
  }
  setStage(id, st) {
    const p = this.byId(id); if (!p) return;
    p.stage = st;
    const L = { drafted: 'moved back to draft', approved: 'approved for sending', sent: 'marked as sent' };
    this.log(`${p.name} ${L[st] || st}`, 'You', 'real');
    this.h.persist(); this.h.change();
  }
  edit(id, f, v) {
    const p = this.byId(id); if (!p) return;
    p.d = { ...p.d, [f]: v, edited: true };
    if (p.stage === 'approved') p.stage = 'drafted';
    this.h.persist(); this.h.change();
  }
  resetDraft(id) {
    const p = this.byId(id), s = this.D.PROSPECTS.find(x => x.id === id);
    if (!p) return;
    if (!s) return this.regenerate(id);
    p.d = { subject: s.subject, body: s.body, edited: false, ai: 0 };
    if (p.stage === 'approved') p.stage = 'drafted';
    this.h.persist(); this.h.change();
  }
  toggleLine(id) { this.lines[id] = !this.isOn(id); this.h.persist(); this.h.change(); }
  togglePause(id) { const a = this.agents.find(x => x.id === id); a.paused = !a.paused; this.h.persist(); this.h.change(); }
  addProspect(name, note) {
    const id = 'u' + Date.now();
    this.P.push({
      id, name, kind: 'Client', group: 'Added by you', where: 'Location to confirm', site: '', fit: 60, value: 0, lines: [], halo: [], to: 'Relevant team', user: true, note: note || '',
      why: 'Added by you. No verified facts yet, so the draft stays general and flags what to check.', facts: [], confirm: ['Every statement about this organisation is unverified', 'Find the right team and a contact route'],
      stage: 'found', disc: true, d: { subject: '', body: '', edited: false, ai: 0 },
    });
    this.log(`Added ${name} to the pipeline`, 'You', 'real');
    this.h.persist(); this.regenerate(id);
    return id;
  }
  async regenerate(id) {
    const p = this.byId(id); if (!p || p._busy) return;
    const prev = p.stage; p._busy = true; p.stage = 'drafting'; this.h.change();
    try {
      const txt = await this.real('drafter', 'Claude is drafting for ' + p.name, () => this.h.claude(promptFor(p, this.cfg(), this.D)));
      const m = /SUBJECT:\s*(.+?)\r?\n+([\s\S]*)/i.exec(String(txt).trim());
      p.d = m ? { subject: m[1].trim(), body: m[2].trim(), edited: false, ai: Date.now() } : { subject: 'Introduction', body: String(txt).trim(), edited: false, ai: Date.now() };
      p.stage = prev === 'sent' ? 'sent' : 'drafted';
      this.log(`New draft for ${p.name}, written by Claude`, 'Drafter', 'real');
    } catch (e) {
      p.stage = prev === 'drafting' ? 'found' : prev;
      this.log(`Draft for ${p.name} failed. ${(e && e.message) || 'Try again in a minute.'}`, 'Drafter', 'sys');
    }
    p._busy = false; this.h.persist(); this.h.change();
  }
  save() {
    const p = {};
    this.P.forEach(x => { if (!x.user) p[x.id] = { stage: x.stage, d: (x.d.edited || x.d.ai) ? x.d : undefined }; });
    const manual = this.P.filter(x => x.user).map(x => { const { _lock, _busy, ...r } = x; return r; });
    return { p, manual, lines: this.lines, paused: Object.fromEntries(this.agents.map(a => [a.id, a.paused])) };
  }
}
