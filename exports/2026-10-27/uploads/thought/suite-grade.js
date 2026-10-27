// Grading for ChemGraph: how far a molecule has climbed toward "stable, new, worth making".
// Ladder: Proposed → Valid (RDKit parses it, valences sane) → New (PubChem has no record of it)
//         → Stable (no unstable or reactive groups, sane strain and size) → Drug-like (Lipinski, Veber, QED-style) → Backed (evidence on the map).
// This is computational screening. Only synthesis and measurement in a lab show that a compound is stable.
// "New" means unknown to PubChem, which is the largest public index; patents and private libraries can still hold it.
let RD = null, RDp = null;
export function rdkit() {
  if (RD) return Promise.resolve(RD); if (RDp) return RDp;
  RDp = new Promise((res, rej) => {
    if (typeof window === 'undefined') return rej(new Error('no window'));
    const go = () => window.initRDKitModule({ locateFile: () => 'https://unpkg.com/@rdkit/rdkit@2024.3.5-1.0.0/dist/RDKit_minimal.wasm' }).then(m => { RD = m; res(m); }, rej);
    if (window.initRDKitModule) return go();
    const s = document.createElement('script'); s.src = 'https://unpkg.com/@rdkit/rdkit@2024.3.5-1.0.0/dist/RDKit_minimal.js'; s.async = true; s.onload = go; s.onerror = () => rej(new Error('could not load RDKit')); document.head.appendChild(s);
  }).catch(e => { RDp = null; throw e; });
  return RDp;
}
// SMARTS for groups that make a compound unstable, explosive or too reactive to keep.
export const ALERTS = [
  ['peroxide', '[OX2][OX2]', 3], ['azide', '[N-]=[N+]=N', 3], ['diazo', '[#6]=[N+]=[N-]', 3], ['acyl halide', 'C(=O)[Cl,Br,I]', 2], ['sulfonyl halide', 'S(=O)(=O)[Cl,Br,I]', 2],
  ['isocyanate', 'N=C=O', 2], ['aldehyde', '[CX3H1](=O)[#6]', 1], ['anhydride', 'C(=O)OC(=O)', 2], ['nitroso', '[#6,#7][NX2]=O', 2], ['polynitro', '[N+](=O)[O-].[N+](=O)[O-].[N+](=O)[O-]', 3],
  ['N-N single bond chain', '[NX3][NX3][NX3]', 2], ['three-membered heteroring', '[C1][O,N,S]1', 1], ['cyclopropene', 'C1=CC1', 2], ['allene', 'C=C=C', 1], ['ketene', 'C=C=O', 3],
  ['Michael acceptor', 'C=CC(=O)[#6,#8]', 1], ['thiol', '[SX2H]', 1], ['enol ether', '[CX3]=[CX3][OX2][#6]', 1], ['hemiacetal', '[OX2H][CX4][OX2]', 1], ['quaternary nitrogen', '[NX4+]', 1],
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function smilesOf(n) { if (n.mol && n.mol.smiles) return n.mol.smiles; const m = String(n.detail || '').match(/SMILES:\s*([^\s.]+(?:\.[^\s]+)?)/); return m ? m[1].replace(/[.,;]$/, '') : ''; }
export function isMolecule(n) { return !!smilesOf(n); }

async function pubchemKnows(smiles) {
  try { const r = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/JSON?smiles=' + encodeURIComponent(smiles)); if (r.status === 404) return { known: false }; if (!r.ok) return { known: null }; const j = await r.json(), cid = j && j.IdentifierList && j.IdentifierList.CID && j.IdentifierList.CID[0]; return { known: !!cid, cid: cid || null }; } catch (e) { return { known: null }; }
}

export async function gradeMolecule(n, o = {}) {
  const smiles = smilesOf(n), out = { smiles, steps: [], level: 0, levelName: 'Proposed', score: 0, flags: [], at: Date.now() };
  if (!smiles) return null;
  let M = null; try { M = await rdkit(); } catch (e) { out.flags.push('RDKit did not load, so structure checks were skipped'); }
  let desc = null, canon = smiles, valid = null;
  if (M) { let mol = null; try { mol = M.get_mol(smiles); valid = !!(mol && mol.is_valid()); if (valid) { canon = mol.get_smiles(); desc = JSON.parse(mol.get_descriptors()); for (const [name, sm, sev] of ALERTS) { let q = null; try { q = M.get_qmol(sm); const hit = q && JSON.parse(mol.get_substruct_matches(q) || '[]'); if (hit && hit.length) out.flags.push({ name, sev }); } catch (e) {} finally { if (q) q.delete(); } } } } catch (e) { valid = false; } finally { if (mol) mol.delete(); } }
  out.canon = canon;
  const known = o.skipLookup ? { known: n.mol && n.mol.cid ? true : null, cid: n.mol && n.mol.cid } : (n.mol && n.mol.cid ? { known: true, cid: n.mol.cid } : await pubchemKnows(canon));
  const d = desc || {}, mw = d.exactmw ?? d.amw, logp = d.CrippenClogP, tpsa = d.tpsa, hbd = d.NumHBD ?? d.lipinskiHBD, hba = d.NumHBA ?? d.lipinskiHBA, rot = d.NumRotatableBonds, rings = d.NumRings, fsp3 = d.FractionCSP3, heavy = d.NumHeavyAtoms, stereo = d.NumAtomStereoCenters;
  const alertPts = out.flags.filter(f => f.sev).reduce((t, f) => t + f.sev, 0);
  // Stability: alerts dominate; very small or very large, ring-poor floppy chains and high stereo counts lower it.
  const stab = valid ? clamp(1 - alertPts * 0.22 - (heavy != null && heavy < 6 ? 0.2 : 0) - (rot != null && rot > 12 ? 0.15 : 0) - (stereo != null && stereo > 5 ? 0.1 : 0), 0, 1) : 0;
  const lip = desc ? [mw <= 500, logp <= 5, hbd <= 5, hba <= 10].filter(Boolean).length / 4 : null, veb = desc ? ((tpsa ?? 0) <= 140 && (rot ?? 0) <= 10 ? 1 : 0) : null;
  const qedish = desc ? clamp(0.25 * lip + 0.15 * veb + 0.2 * (1 - Math.abs((mw - 350) / 350)) + 0.2 * (1 - Math.abs((logp - 2.5) / 4)) + 0.2 * clamp(fsp3 / 0.5, 0, 1), 0, 1) : null;
  // Synthetic accessibility proxy: size, rings, stereo. A rough guide only.
  const sa = desc ? clamp(1 - (heavy > 40 ? 0.3 : 0) - (rings > 5 ? 0.2 : 0) - (stereo || 0) * 0.08, 0, 1) : null;
  const ev = clamp((n.evidence || []).length / 4, 0, 1) * 0.6 + (n.g ?? 0.3) * 0.4;
  const novel = known.known === false ? 1 : known.known === true ? 0 : 0.5;
  out.metrics = { valid, novel, known: known.known, cid: known.cid, stab, drug: qedish, sa, ev, mw, logp, tpsa, hbd, hba, rot, rings, heavy };
  const S = [['Valid', valid === true], ['New', known.known === false], ['Stable', stab >= 0.75], ['Drug-like', qedish != null && qedish >= 0.6], ['Backed', ev >= 0.5]];
  let lvl = 0; for (const [, ok] of S) { if (!ok) break; lvl++; }
  out.steps = S.map(([name, ok]) => ({ name, ok }));
  out.level = lvl; out.levelName = ['Proposed', 'Valid', 'New', 'Stable', 'Drug-like', 'Backed'][lvl];
  out.score = Math.round(100 * (0.15 * (valid ? 1 : 0) + 0.25 * novel + 0.25 * stab + 0.2 * (qedish ?? 0) + 0.15 * ev));
  return out;
}

// Offline analog generator: simple bioisostere and substituent swaps on the SMILES text, kept only if RDKit parses the result.
const SWAPS = [['Cl', 'F'], ['F', 'Cl'], ['Br', 'Cl'], ['c1ccccc1', 'c1ccncc1'], ['c1ccccc1', 'c1ccsc1'], ['OC', 'OCC'], ['OC', 'OC(F)(F)F'], ['C(=O)O', 'C(=O)N'], ['C(=O)N', 'C(=O)NC'], ['N(C)C', 'N1CCCC1'], ['N(C)C', 'N1CCOCC1'], ['CC', 'CCF'], ['c(C)', 'c(C#N)'], ['C#N', 'C(F)(F)F']];
export async function analogs(smiles, k = 4) {
  let M = null; try { M = await rdkit(); } catch (e) { return []; }
  const seen = new Set(), out = [];
  let base = smiles; try { const m0 = M.get_mol(smiles); if (m0 && m0.is_valid()) base = m0.get_smiles(); if (m0) m0.delete(); } catch (e) {}
  seen.add(base);
  for (const [a, b] of SWAPS) { let i = base.indexOf(a); let tries = 0; while (i >= 0 && tries < 3) { const s = base.slice(0, i) + b + base.slice(i + a.length); let m = null; try { m = M.get_mol(s); if (m && m.is_valid()) { const c = m.get_smiles(); if (!seen.has(c)) { seen.add(c); out.push({ smiles: c, change: a + ' → ' + b }); } } } catch (e) {} finally { if (m) m.delete(); } i = base.indexOf(a, i + 1); tries++; } if (out.length >= k * 3) break; }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, k);
}
export function svgOf(smiles) { if (!RD || !smiles) return ''; let m = null; try { m = RD.get_mol(smiles); return m && m.is_valid() ? m.get_svg(220, 160) : ''; } catch (e) { return ''; } finally { if (m) m.delete(); } }
