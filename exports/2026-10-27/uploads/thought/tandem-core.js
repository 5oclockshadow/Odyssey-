// Single source for site copy, structure and funnel. Pages, pamphlet, emails and the site map all read this.
// Placeholders are flagged with todo: true so nothing invented ships as fact.
export const BRAND = { name: 'Map Graph', tagline: 'Map anything, in the context you steer.', sub: 'Drop a node and it finds its place. Nodes ask the questions that fill in the rest. Pick a context, such as logistics or law, and the map speaks its language.', color: { bg: '#0b0e17', panel: '#131827', line: '#252c42', ink: '#eef1ff', mute: '#9aa3c4', cyan: '#27d3ff', pink: '#ff3ea5' } };

export const PAGES = [
  { id: 'home', file: 'Map Graph - Home.dc.html', label: 'Home', nav: true, group: 'Site', goal: 'Explain the idea in ten seconds and capture an email.', cta: 'Join the waitlist', msg: 'Map anything, in the context you steer.' },
  { id: 'product', file: 'Map Graph - Product.dc.html', label: 'Product', nav: true, group: 'Product', goal: 'Show the two engines, the gestures and the four sub-map directions.', cta: 'Join the waitlist', msg: 'Drop a node and it finds its place. Nodes ask the questions.' },
  { id: 'access', file: 'Map Graph - Early Access.dc.html', label: 'Early access', nav: true, group: 'Site', goal: 'Explain the early-access offer and the plan outline.', cta: 'Join the waitlist', msg: 'Early access first. Prices are announced at launch.' },
  { id: 'docs', file: 'Map Graph - Docs.dc.html', label: 'Docs', nav: true, group: 'Site', goal: 'Teach gestures, the shake language, outlines and the API.', cta: 'Try the API console', msg: 'Everything you can do, and every endpoint behind the site.' },
  { id: 'about', file: 'Map Graph - About.dc.html', label: 'About', nav: true, group: 'Site', goal: 'State the principles: honest samples, unverified until confirmed.', cta: 'Join the waitlist', msg: 'We mark what we do not know.' },
  { id: 'contact', file: 'Map Graph - Contact.dc.html', label: 'Contact', nav: true, group: 'Site', goal: 'Route press, partner, support and security messages.', cta: 'Send message', msg: 'Write to us.' },
  { id: 'join', file: 'Map Graph - Join.dc.html', label: 'Join', nav: false, group: 'Funnel', goal: 'Step 2: learn what the member wants to map.', cta: 'Finish', msg: 'Two quick questions.' },
  { id: 'thanks', file: 'Map Graph - Thanks.dc.html', label: 'Thank you', nav: false, group: 'Funnel', goal: 'Show position, give the referral link, offer founding membership.', cta: 'Copy my link', msg: 'You are in. Move up by inviting friends.' },
  { id: 'founding', file: 'Map Graph - Founding.dc.html', label: 'Founding', nav: false, group: 'Funnel', goal: 'Collect founding-member interest. No payment.', cta: 'Register interest', msg: 'A say in what we build next.' },
  { id: 'sitemap', file: 'Map Graph - Site Map.dc.html', label: 'Site map', nav: false, group: 'Plan', goal: 'Plan view of pages, funnel, content and API.', cta: '', msg: '' },
];
export const pageUrl = id => encodeURI((PAGES.find(p => p.id === id) || PAGES[0]).file);

export const PACKS = [
  { id: 'laws', name: 'Laws and regulation', line: 'Statutes, sections, clauses, agencies, cases. See what amends what.', glyph: '§' },
  { id: 'recipes', name: 'Recipes and food', line: 'Dishes, ingredients, steps, techniques, diets.', glyph: '◉' },
  { id: 'dna', name: 'DNA and sequences', line: 'Loci, genes, exons, codons, motifs, variants and the proteins they make.', glyph: '≡' },
  { id: 'coins', name: 'Coins and currency', line: 'Collections, coins, mints, issuers and who holds what.', glyph: '◉' },
  { id: 'homes', name: 'Homes and property', line: 'Portfolios, properties, rooms, systems, owners, lenders, insurers.', glyph: '⌂' },
  { id: 'companies', name: 'Companies and executives', line: 'Groups, subsidiaries, funds, stakes, boards, who leads what.', glyph: '■' },
  { id: 'libraries', name: 'Libraries and ownership', line: 'Libraries, collections, items, donors, loans and licences.', glyph: '▥' },
  { id: 'patents', name: 'Patents and IP', line: 'Families, patents, claims, assignees, inventors, licences.', glyph: '▣' },
];
export const THOUGHT_FEATURES = [
  { t: 'Shake it in plain words', d: 'Type "14 wild ideas around the weakest facts, tangled with links". Map Graph reads the count, the wildness, where to aim and how densely to link, then shows you what it understood.' },
  { t: 'Every shake is a revision', d: 'Each shake becomes Rev B, Rev C and so on. Step back to any revision, or withdraw the latest one. Nothing is lost by trying.' },
  { t: 'Six ways to see one graph', d: 'Classic, 3D with time, matrix, territories, arcs and tree. Same thoughts, same selection, different questions answered.' },
  { t: 'Grounding you can see', d: 'Each thought carries a grounding level, drawn as a fill. Wild ideas stay visibly wild until something supports them.' },
  { t: 'Fuse, challenge, reframe', d: 'Two thoughts can react and produce a third. Any thought can be challenged, or restated on another plane: facts, concepts, principles, wild.' },
  { t: 'Auto and live AI', d: 'Let it grow on its own. With Claude available, thoughts are written live. Without it, the built-in engine keeps going.' },
];
export const ATLAS_FEATURES = [
  { t: 'Steer the context', d: 'Tell the map what it is for: logistics, law, a recipe box, a family archive, or a context you define yourself. The kinds of thing and the verbs follow.' },
  { t: 'Drop a node, it finds its place', d: 'Ctrl+click anywhere and name it. The map picks the type, the container it belongs in and the links it should have, and tells you why.' },
  { t: 'Nodes ask the questions', d: 'Every node asks what is missing: who owns it, what it is made of, what it is for, what comes before it. Answer in a word and the link is made.' },
  { t: 'Sub-map any idea', d: 'Map INTO an idea to see what it is made of, FOR it to see what it serves, FROM it to see what follows, or in REVERSE to trace back to the source.' },
  { t: 'Routes and missing steps', d: 'Pick two ideas and see every forward and reverse route between them. If none exists, the map adds the question that would bridge them.' },
  { t: 'Honest by default', d: 'Samples use invented names. Anything the engine or Claude adds is marked unverified until you confirm it.' },
];
export const GESTURES = [
  ['Click', 'Select a node and see what it asks'], ['Double-click or Enter', 'Go inside a node'], ['Backspace', 'Come back up a level'],
  ['Ctrl+click on empty space', 'Drop a node where you clicked; it finds its place'], ['Ctrl+Shift+click on empty space', 'Drop a node linked from the selection'],
  ['Ctrl+click on a node', 'Add a node inside it'], ['Ctrl+Shift+click on a node', 'Add a node linked from it'], ['Right-click', 'Menu: enter, add inside, add linked, link to, delete'],
  ['Delete', 'Remove the selected node and what is inside it'], ['1 to 5', 'Switch view: network, columns, table, flow, radial'],
];
export const DIRECTIONS = [
  { k: 'Into', d: 'What an idea is made of. Parts, stages, inputs.', ex: 'Opening a bakery: permits, kitchen, staff, first menu.' },
  { k: 'For', d: 'What an idea serves, and who needs it.', ex: 'A cold store: fresh deliveries, retail customers.' },
  { k: 'From', d: 'What follows from an idea, downstream.', ex: 'A signed lease: fit-out, hiring, opening day.' },
  { k: 'Reverse', d: 'What must be true before an idea, back to the source.', ex: 'Opening day: stock, staff, licence, funding.' },
];
export const FIELDS_NOTE = 'Maps begin with only your topic. Steer in plain words, and add your own kinds of ideas and links as you go.';
export const AUDIENCES = [
  { who: 'Researchers and analysts', use: 'Lay out a literature or a market as levels, and see what no one has connected.' },
  { who: 'Founders and strategists', use: 'Shake out options, then map the companies, stakes and suppliers around them.' },
  { who: 'Lawyers and compliance teams', use: 'Trace which section amends which, and which agency enforces what.' },
  { who: 'Students and educators', use: 'Turn a syllabus into a map you can walk through, from topic to detail.' },
  { who: 'Writers and game designers', use: 'Grow a world from a seed, then map its houses, rulers, coins and secrets.' },
  { who: 'Genealogists, collectors and archivists', use: 'Record who held what, when, and mark every uncertain link as unverified.' },
  { who: 'Product and engineering teams', use: 'Keep an idea graph and a system map in two tabs that work while you code.' },
];
export const STEPS = [
  { n: '01', t: 'Steer', d: 'Name the topic or pick a context. The map speaks its language.' },
  { n: '02', t: 'Drop', d: 'Ctrl+click and type a name. The node finds its type, its container and its links.' },
  { n: '03', t: 'Answer', d: 'Nodes ask what is missing. A word is enough. Sub-map any idea into, for, from or in reverse.' },
];
export const FAQ = [
  { q: 'Are the example fields the only things it can map?', a: 'No. Laws, recipes, DNA, coins, homes, companies, libraries, patents and logistics are examples. Any topic can be mapped, and you can define your own context with your own kinds of thing and verbs. Samples use invented names. Anything added by the engine or by Claude is marked unverified until you confirm it.' },
  { q: 'Do the two tabs really keep working in the background?', a: 'Yes. Auto mode runs on background timers and holds a browser lock while it works, so it continues when you switch tabs. A browser can still pause a tab under heavy memory pressure.' },
  { q: 'Where is my data stored?', a: 'In your browser by default. Export a map or a graph as JSON at any time.' },
  { q: 'Does it need an AI connection?', a: 'No. The built-in engine grows graphs and maps by itself. When Claude is available you can switch on Live AI for richer wording.' },
  { q: 'When will it launch, and what will it cost?', a: 'Dates and prices are not announced yet. Waitlist members get early access first.', todo: true },
  { q: 'Who is behind Map Graph?', a: 'This page is a placeholder for the team and company details.', todo: true },
];
export const TIERS = [
  { id: 'explorer', name: 'Explorer', price: 'Announced at launch', todo: true, line: 'For one person trying things out.', items: ['Both engines', 'Eight starting fields', 'Export to JSON', 'Local storage'] },
  { id: 'studio', name: 'Studio', price: 'Announced at launch', todo: true, line: 'For people who map every week.', items: ['Everything in Explorer', 'Live AI fill and auto research', 'Unlimited maps and revisions', 'Sync between devices'], hot: true },
  { id: 'team', name: 'Team', price: 'Announced at launch', todo: true, line: 'For groups sharing maps.', items: ['Everything in Studio', 'Shared maps and comments', 'Roles and an audit trail', 'Priority support'] },
];
export const SHAKE_WORDS = [
  ['How many', '14, a few, a couple, a handful, a dozen, lots, a flood', 'Sets the number of new thoughts, 1 to 40.'],
  ['Wildness', 'wild, crazy, weird / grounded, safe, factual', 'Moves the mix toward wild ideas or toward facts.'],
  ['Links', 'dense, tangled, interlinked / loose, sparse, 3 links', 'Sets how many cross-links each new thought gets, 0 to 4.'],
  ['Aim', 'weakest, hubs, fringe, bridges, newest', 'Chooses which thoughts the shake grows from.'],
  ['Moves', 'fuse, challenge, reframe', 'Switches on specific moves; growing is always on.'],
  ['Planes', 'facts, principles, concepts, wild', 'Leans the new thoughts toward a plane.'],
];
export const DRIP_PLAN = [
  { id: 'welcome', day: 0, subject: "You're on the list", goal: 'Confirm the spot, give the referral link, set expectations.' },
  { id: 'nurture1', day: 2, subject: 'Shake out thoughts in plain words', goal: 'Teach the one move that makes Thoughts click.' },
  { id: 'nurture2', day: 5, subject: 'Map a field you know', goal: 'Show Atlas fields and the honesty rule.' },
  { id: 'upgrade', day: 10, subject: 'Founding membership is open', goal: 'Invite interest in founding membership. No payment.' },
  { id: 'lastcall', day: 14, subject: 'Last call for founding places', goal: 'Close the loop on founding interest.' },
];
