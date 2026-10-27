export const SITES = [
  { id: 'A', name: 'Site A · coastal Iberia', lat: 36.8, lon: -2.2 },
  { id: 'B', name: 'Site B · Gulf coast', lat: 27.0, lon: 49.7 },
  { id: 'C', name: 'Site C · tidal flat, Australia', lat: -20.3, lon: 118.6 },
  { id: 'D', name: 'Salton Sea · California', lat: 33.3, lon: -115.8 },
];
export const TOPICS = ['Irrigating halophytes with desalination reject brine', 'Autonomous drone surveys over coastal wetlands', 'Importing and growing a non-native halophyte', 'Selling halophyte seed oil as a fuel feedstock', 'Restoring mangrove on public foreshore', 'Selling carbon credits from a restored marsh'];
export const LEVELS = ['International', 'National or federal', 'State or provincial', 'Regional or basin', 'Local or municipal'];

const j = async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const km = (a, b, c, d) => { const R = 6371, r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

export async function weather(sites = SITES) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${sites.map(s => s.lat)}&longitude=${sites.map(s => s.lon)}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation&daily=temperature_2m_max,precipitation_sum,wind_gusts_10m_max&forecast_days=3&timezone=auto&wind_speed_unit=ms`;
  const d = await j(u);
  return (Array.isArray(d) ? d : [d]).map((x, i) => {
    const c = x.current, g = c.wind_gusts_10m, p = c.precipitation;
    const adv = p > 0 || g > 14 ? 'No-go' : g > 10 ? 'Marginal' : 'Good';
    return { id: sites[i].id, name: sites[i].name, temp: Math.round(c.temperature_2m) + '°C', wind: c.wind_speed_10m.toFixed(1) + ' m/s', gust: g.toFixed(1) + ' m/s', rain: p + ' mm', adv, next: x.daily.time.map((t, k) => `${t.slice(5)}: ${Math.round(x.daily.temperature_2m_max[k])}°C, gusts ${x.daily.wind_gusts_10m_max[k].toFixed(0)} m/s, rain ${x.daily.precipitation_sum[k]} mm`) };
  });
}

export async function scenes(sites = SITES) {
  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z';
  return Promise.all(sites.map(async s => {
    const base = { id: s.id, name: s.name, lat: s.lat, lon: s.lon };
    try {
      const d = await j('https://earth-search.aws.element84.com/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: [s.lon - 0.2, s.lat - 0.2, s.lon + 0.2, s.lat + 0.2], datetime: from + '/..', limit: 30, sortby: [{ field: 'properties.datetime', direction: 'desc' }] }) });
      const f = d.features || [], latest = f[0];
      const clear = f.slice().sort((a, b) => (a.properties['eo:cloud_cover'] ?? 100) - (b.properties['eo:cloud_cover'] ?? 100))[0];
      return { ...base, n: f.length >= 30 ? '30+' : String(f.length), date: latest ? latest.properties.datetime.slice(0, 10) : 'none', cloud: latest ? Math.round(latest.properties['eo:cloud_cover']) + '%' : '', clearDate: clear ? clear.properties.datetime.slice(0, 10) : '', clearCloud: clear ? Math.round(clear.properties['eo:cloud_cover']) + '%' : '', thumb: clear && clear.assets && clear.assets.thumbnail ? clear.assets.thumbnail.href : '' };
    } catch (e) { return { ...base, n: '–', date: 'unavailable', cloud: '' }; }
  }));
}

export async function quakes() {
  const d = await j('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
  const f = d.features.slice().sort((a, b) => b.properties.mag - a.properties.mag);
  return { count: d.features.length, top: f.slice(0, 6).map(q => { const [lo, la] = q.geometry.coordinates; const n = SITES.map(s => ({ s, k: km(la, lo, s.lat, s.lon) })).sort((a, b) => a.k - b.k)[0]; return { mag: q.properties.mag.toFixed(1), place: q.properties.place, when: new Date(q.properties.time).toISOString().slice(5, 16).replace('T', ' ') + ' UTC', tsunami: !!q.properties.tsunami, url: q.properties.url, near: `${Math.round(n.k).toLocaleString()} km from ${n.s.name.split(' · ')[0]}` }; }) };
}

export async function regs(term) {
  const u = `https://www.federalregister.gov/api/v1/documents.json?per_page=8&order=relevance&conditions[term]=${encodeURIComponent(term)}&fields[]=title&fields[]=agencies&fields[]=publication_date&fields[]=type&fields[]=html_url`;
  const d = await j(u);
  const docs = (d.results || []).map(r => ({ title: r.title, agency: (r.agencies || []).map(a => a.name).join(', ') || 'Agency not listed', date: r.publication_date, type: r.type, url: r.html_url }));
  const ag = {}; docs.forEach(x => x.agency.split(', ').forEach(a => { ag[a] = (ag[a] || 0) + 1; }));
  return { total: d.count || docs.length, docs, agencies: Object.keys(ag) };
}

export function analysisRequest(topic, levels, juris, res) {
  const system = 'You are a regulatory analyst for an environmental science institute. You have no access to legal databases in this call. Evidence is limited to the Federal Register results supplied. Everything else is general knowledge and must be labelled unverified. Never cite statute numbers, section numbers, case names or dates you were not given. Look for incongruities between government levels and agencies: conflicts, gaps, overlaps, definitions that differ, and permit sequences that contradict each other. Output JSON only with this shape: {"agencies":[{"level":"","name":"","role":"","basis":"supplied|unverified"}],"incongruities":[{"kind":"conflict|gap|overlap|definition|timing","between":"","issue":"","impact":"","verify":""}],"next":[""]}. Give 5 to 8 agencies, 4 to 7 incongruities and 3 next steps. Plain language, no legal advice.';
  const user = `Activity: ${topic}\nGovernment levels in scope: ${levels.join(', ')}\nJurisdiction: ${juris || 'not specified, treat as a generic federal system'}\nFederal Register results (US federal only):\n${res && res.docs.length ? res.docs.map(d => `- ${d.title} (${d.agency}, ${d.date}, ${d.type})`).join('\n') : '- none retrieved'}`;
  return { system, messages: [{ role: 'user', content: user }], max_tokens: 1800 };
}
export function parseAnalysis(t) { const m = /\{[\s\S]*\}/.exec(t); if (!m) throw new Error('No structured answer'); return JSON.parse(m[0]); }
