const L = (cat, rows) => rows.map(r => ({ id: r[0], name: r[1], cat, mode: r[2], k: r[3], days: r[4] }));

export const CATS = ['Carbon and nature', 'Compliance and reporting', 'Data and monitoring', 'Knowledge products', 'Field services'];

export const LINES = [
  ...L(CATS[0], [
    ['cn1', 'Blue-carbon pre-feasibility screen', 'A', 8, 10],
    ['cn2', 'Tidal-wetland carbon desk review (VM0033)', 'AH', 14, 21],
    ['cn3', 'Soil-carbon sampling plan', 'A', 6, 10],
    ['cn4', 'Biodiversity baseline, satellite and eDNA', 'AH', 20, 30],
    ['cn5', 'Biodiversity net gain assessment (UK)', 'AH', 7, 14],
    ['cn6', 'MRV dashboard subscription', 'A', 4, 14],
    ['cn7', 'SME carbon footprint audit', 'A', 3, 7],
    ['cn8', 'TNFD gap analysis', 'AH', 11, 21],
    ['cn9', 'Nature-positive target setting', 'AH', 9, 21],
    ['cn10', 'Biodiversity-credit due diligence', 'AH', 12, 21]]),
  ...L(CATS[1], [
    ['cr1', 'CSRD ESRS E3 and E4 gap assessment', 'AH', 12, 21],
    ['cr2', 'Environmental permit drafting', 'AH', 9, 21],
    ['cr3', 'EIA screening note', 'AH', 5, 7],
    ['cr4', 'Phase I environmental site assessment (desk)', 'AH', 4, 10],
    ['cr5', 'Water-quality compliance reports', 'A', 3, 7],
    ['cr6', 'Green-claims risk review', 'A', 4, 7],
    ['cr7', 'EUDR geolocation due diligence', 'A', 6, 14],
    ['cr8', 'GRI sustainability report drafting', 'AH', 8, 30],
    ['cr9', 'Waste and circularity audit', 'AH', 6, 21],
    ['cr10', 'ISO 14001 gap check', 'AH', 5, 14]]),
  ...L(CATS[2], [
    ['dm1', 'Satellite vegetation monitoring', 'A', 6, 7],
    ['dm2', 'Drone orthomosaic survey', 'F', 5, 14],
    ['dm3', 'eDNA sampling brokerage', 'F', 7, 21],
    ['dm4', 'Soil-salinity (EC) mapping', 'F', 9, 21],
    ['dm5', 'Water-quality sensor lease', 'F', 12, 45],
    ['dm6', 'Air-quality micro-sensors', 'F', 8, 30],
    ['dm7', 'Shoreline-change monitoring', 'A', 5, 7],
    ['dm8', 'Wetland-extent change reports', 'A', 3, 5],
    ['dm9', 'Species-distribution baselines', 'A', 4, 7],
    ['dm10', 'Halophyte trait dataset (API)', 'A', 5, 14]]),
  ...L(CATS[3], [
    ['kp1', 'Grant proposal drafting', 'AH', 8, 30],
    ['kp2', 'Policy briefs', 'AH', 4, 10],
    ['kp3', 'On-demand literature reviews', 'A', 2.5, 5],
    ['kp4', 'Saline-agriculture online course', 'A', 3, 45],
    ['kp5', 'Field manuals and SOPs', 'AH', 2, 14],
    ['kp6', 'Workshops and webinars', 'AH', 3, 14],
    ['kp7', 'Investor technical due diligence', 'AH', 15, 14],
    ['kp8', 'Climate-tech white papers', 'AH', 3.5, 10],
    ['kp9', 'Extension-officer training', 'AH', 6, 30],
    ['kp10', 'Report peer review and QA', 'A', 2, 5]]),
  ...L(CATS[4], [
    ['fs1', 'Marsh and mangrove planting crews', 'F', 40, 60],
    ['fs2', 'Invasive-species survey and plan', 'F', 12, 30],
    ['fs3', 'Bird and habitat baselines', 'F', 10, 30],
    ['fs4', 'Stormwater and rain-garden design', 'AH', 7, 21],
    ['fs5', 'Living-shoreline design', 'AH', 20, 45],
    ['fs6', 'School education kits', 'A', 1.5, 30],
    ['fs7', 'Native and halophyte plug supply', 'F', 15, 60],
    ['fs8', 'Soil-sampling contracts', 'F', 4, 14],
    ['fs9', 'Post-planting restoration monitoring', 'F', 9, 45],
    ['fs10', 'Camera-trap wildlife surveys', 'F', 8, 45]]),
];

export const MODES = { A: 'Agent', AH: 'Agent + review', F: 'Field crew' };

export const HALO = [
  { id: 'hs1', name: 'Edible halophytes', species: 'Salicornia (sea asparagus), agretti, sea purslane', buyers: 'Food service, retail growers', stage: 'Market-ready', note: 'Sold fresh to chefs and retail; grown on saline land and seawater.' },
  { id: 'hs2', name: 'Saline forage', species: 'Atriplex (saltbush), saltgrass (Distichlis)', buyers: 'Livestock operations on brackish land', stage: 'Pilot', note: 'Feed from land and water that conventional forage cannot use.' },
  { id: 'hs3', name: 'Seed oil and fuel feedstock', species: 'Salicornia bigelovii, seashore mallow', buyers: 'Biofuel and oleochemical developers', stage: 'Research', note: 'Oilseed crops irrigated with seawater or brine.' },
  { id: 'hs4', name: 'Plant salt and seasonings', species: 'Dried Salicornia', buyers: 'Food brands', stage: 'Pilot', note: 'A lower-sodium salt substitute with a savoury flavour.' },
  { id: 'hs5', name: 'Saline-land reclamation', species: 'Mixed halophyte covers', buyers: 'Water districts, farm cooperatives', stage: 'Pilot', note: 'Revegetating salt-affected fields so land earns again.' },
  { id: 'hs6', name: 'Brine valorization', species: 'Halophyte beds on reject brine', buyers: 'Desalination operators', stage: 'Research', note: 'Plants and salt harvest that cut the volume discharged to sea.' },
  { id: 'hs7', name: 'Marsh and mangrove restoration', species: 'Salt-marsh grasses, mangroves', buyers: 'Developers, ports, conservation funds', stage: 'Pilot', note: 'Planting with remote monitoring and carbon accounting built in.' },
  { id: 'hs8', name: 'Bioactive extracts', species: 'Rock samphire, Salicornia', buyers: 'Cosmetic and nutraceutical ingredient houses', stage: 'Research', note: 'Plant compounds for skin-care and supplements.' },
];

export const AGENTS = [
  { id: 'scout', name: 'Scout', lane: 'ops', cap: 2, role: 'Finds and qualifies organisations that fit the lines you have switched on.' },
  { id: 'drafter', name: 'Drafter', lane: 'ops', cap: 1, role: 'Writes outreach from stated facts. Nothing is sent without your approval.' },
  { id: 'funder', name: 'Funder', lane: 'ops', cap: 1, role: 'Matches R&D work to public grant programmes.' },
  { id: 'watcher', name: 'Watcher', lane: 'ops', cap: 1, role: 'Tracks aviation, reporting and carbon-standard rules that affect field work.' },
  { id: 'dispatch', name: 'Dispatcher', lane: 'ops', cap: 1, role: 'Assigns field jobs to human crews, then to drones and robots as gates pass.' },
  { id: 'labsim', name: 'Lab Sim', lane: 'rnd', cap: 4, role: 'Drone and ground-robot simulation, planning and controls.' },
  { id: 'labagro', name: 'Lab Agro', lane: 'rnd', cap: 3, role: 'Halophyte yield, brine-irrigation and trial-design models.' },
  { id: 'labdata', name: 'Lab Data', lane: 'rnd', cap: 3, role: 'Remote sensing, salinity mapping and literature work.' },
];

export const REGIONS = ['the Arabian Peninsula', 'the Red Sea coast', 'the Nile Delta', 'Iberia', 'the North Sea coast', 'the California Central Valley', 'the Colorado River delta', 'the Murray–Darling Basin', 'the Western Australia wheatbelt', 'the Atacama and Altiplano', 'Gujarat and the Rann of Kutch', 'the Indus Delta', 'the Bengal Delta', 'the Mekong Delta', 'the north coast of Java', 'the East African coast'];

export const FUNDERS = ['Horizon Europe', 'EU LIFE Programme', 'Innovate UK', 'Green Climate Fund', 'Global Environment Facility', 'USDA NIFA', 'ARC Linkage'];

export const WATCH = ['drone operating rules in the EU and UK', 'drone operating rules in the US and Gulf states', 'the Verra tidal-wetland methodology', 'the CSRD biodiversity standard', 'the EU deforestation regulation timeline', 'plant-material export rules'];

export const PROGRAMS = [
  { id: 'p1', name: 'Survey drone autonomy', trl: 4, lab: 'Lab Sim', note: 'Mission planning, abort rules and multispectral capture over salt flats and tidal ground.', m: { label: 'Mission success in simulation', v: 71, t: 95, u: '%' } },
  { id: 'p2', name: 'Salinity mapping from imagery', trl: 3, lab: 'Lab Data', note: 'Predict soil electrical conductivity from satellite and drone bands, checked against field probes.', m: { label: 'EC prediction error (RMSE)', v: 3.4, t: 1, u: ' dS/m' } },
  { id: 'p3', name: 'Ground robot for soft mud', trl: 2, lab: 'Lab Sim', note: 'A low-ground-pressure platform for sampling and planting on tidal and saline ground.', m: { label: 'Track slip ratio', v: 0.38, t: 0.15, u: '' } },
  { id: 'p4', name: 'Plug-transplant end effector', trl: 2, lab: 'Lab Sim', note: 'Handling and placing Salicornia plugs without root damage.', m: { label: 'Plug survival in simulation', v: 62, t: 90, u: '%' } },
  { id: 'p5', name: 'Halophyte yield model', trl: 3, lab: 'Lab Agro', note: 'Yield as a function of salinity, planting density and season, trained on trial and published data.', m: { label: 'Yield forecast error (MAPE)', v: 24, t: 10, u: '%' } },
  { id: 'p6', name: 'Brine-irrigation loop', trl: 3, lab: 'Lab Agro', note: 'Halophyte beds and salt harvest sized against a reference desalination plant.', m: { label: 'Brine volume reduced (model)', v: 12, t: 40, u: '%' } },
];

export const EXPS = {
  labsim: [['p1', 'Coverage planner on a 120 ha tidal flat'], ['p1', 'Wind-gust abort rules, 40 scenarios'], ['p1', 'Return-to-home logic after GNSS loss'], ['p3', 'Track pattern on 15 kPa mud'], ['p3', 'Sealed drive unit, salt-spray test plan'], ['p4', 'Plug pick-and-place cycle'], ['p4', 'Gripper pressure sweep on Salicornia plugs']],
  labagro: [['p5', 'Yield against salinity, curve fit'], ['p5', 'Planting-density model, five densities'], ['p6', 'Brine mass balance, 1,000 m³ a day plant'], ['p6', 'Salt-harvest cycle schedule']],
  labdata: [['p2', 'Salinity index regression on six sites'], ['p2', 'Satellite against drone EC prediction'], ['p5', 'Literature pull: halophyte yield datasets'], ['p2', 'Canopy segmentation on multispectral tiles']],
};

export const PHASES = [
  { n: 0, name: 'Human crews, handheld sensors', status: 'Now', share: 0, body: 'Field ecologists, agronomists and licensed pilots collect all data. Agents write protocols, plan routes and process what comes back.', gate: 'Every field protocol is written and every dataset reaches the pipeline without manual cleanup.' },
  { n: 1, name: 'Drone-assisted surveys', status: 'Next', share: 15, body: 'Licensed pilots fly routes the agents plan. Imagery is processed automatically and checked against ground samples.', gate: 'Simulated mission success at or above 95%, plus a logged record of supervised flights.' },
  { n: 2, name: 'Autonomous survey flights', status: 'Later', share: 40, body: 'Aircraft fly approved missions on their own while one remote pilot supervises several. A named human stays responsible for each operation.', gate: 'Operating approval in each country and a safety case reviewed by an outside aviation specialist.' },
  { n: 3, name: 'Ground robots on trial plots', status: 'Later', share: 65, body: 'Tracked robots take soil readings and plant plugs on our own plots, with a person on site supervising.', gate: 'Plug survival at or above 90% and no unplanned stops across a full planting season.' },
  { n: 4, name: 'Mixed fleet, human exceptions', status: 'Later', share: 80, body: 'Machines do the repeat work. People install equipment, handle exceptions and work with landowners and communities.', gate: 'The machine share of field hours holds for a full year with safety and data-quality targets met.' },
];

export const CREW = [
  { region: 'Iberia', roles: ['2 field ecologists', '1 agronomist', '1 licensed pilot'] },
  { region: 'Gulf', roles: ['1 field ecologist', '1 agronomist', '1 licensed pilot'] },
  { region: 'Australia', roles: ['1 field ecologist', '1 licensed pilot'] },
  { region: 'California', roles: ['1 field ecologist', '1 licensed pilot'] },
  { region: 'Chile', roles: ['1 field ecologist', '1 licensed pilot'] },
];

export const FLEET = [
  { name: 'Survey drone, multispectral', phase: 'Phase 1', status: 'Simulation', next: 'Supervised flights with a licensed pilot' },
  { name: 'Fixed sensor stations', phase: 'Phase 1', status: 'Design', next: 'Pilot units installed by crews' },
  { name: 'Sampling drone, water and soil', phase: 'Phase 2', status: 'Concept', next: 'Payload and tether study' },
  { name: 'Ground robot, soft-mud tracked', phase: 'Phase 3', status: 'Concept', next: 'Traction tests in simulation' },
  { name: 'Planting robot, plug transplanter', phase: 'Phase 3', status: 'Concept', next: 'End-effector design' },
];

export const JOBS = [
  { title: 'Soil EC grid, plot A1', site: 'Iberia · Site A', ex: 'Human crew', st: 0 },
  { title: 'Canopy imaging, plot A1', site: 'Iberia · Site A', ex: 'Drone-assisted', st: 0 },
  { title: 'Plug transplant, plot B2', site: 'Gulf · Site B', ex: 'Human crew', st: 1 },
  { title: 'Water sampling, brine inlet B', site: 'Gulf · Site B', ex: 'Human crew', st: 1 },
  { title: 'Multispectral flight, tidal flat C', site: 'Australia · Site C', ex: 'Drone-assisted', st: 2 },
  { title: 'Survival count, plot A2', site: 'Iberia · Site A', ex: 'Human crew', st: 2 },
  { title: 'Biomass weigh-in, plot B1', site: 'Gulf · Site B', ex: 'Human crew', st: 3 },
  { title: 'Autonomous coverage flight (sim), flat C', site: 'Australia · Site C', ex: 'Autonomous (sim)', st: 0 },
];
export const JOB_NEXT = [['Soil EC grid, plot A3', 'Iberia · Site A', 'Human crew'], ['Canopy imaging, plot B1', 'Gulf · Site B', 'Drone-assisted'], ['Water sampling, outlet C', 'Australia · Site C', 'Human crew'], ['Plug transplant, plot A4', 'Iberia · Site A', 'Human crew'], ['Multispectral flight, flat D', 'Australia · Site C', 'Drone-assisted'], ['Survival count, plot B2', 'Gulf · Site B', 'Human crew'], ['Autonomous coverage flight (sim), flat D', 'Australia · Site C', 'Autonomous (sim)']];

export const PROSPECTS = [
  {
    id: 'rsg', name: 'Red Sea Global', kind: 'Client', group: 'Middle East', where: 'Saudi Arabia', site: 'https://www.redseaglobal.com', fit: 92, value: 150, disc: true,
    lines: ['cn4', 'dm1', 'dm7', 'fs1', 'fs9'], halo: ['hs7', 'hs5'], to: 'Sustainability and environment team',
    why: 'A coastal destination developer with public conservation commitments and active mangrove work. It needs low-cost monitoring between field visits and salt-tolerant planting advice.',
    facts: ['Develops coastal destinations on the Red Sea', 'Publishes conservation and sustainability targets', 'Runs coastal restoration work that includes mangroves'],
    confirm: ['Exact wording and dates of its conservation targets', 'Scale and status of its mangrove programme', 'Whether sustainability, environment or development owns this'],
    subject: 'Vegetation and shoreline monitoring, and native halophyte planting, for the Red Sea coast',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes (salt-tolerant plants) and automated field monitoring.

Red Sea Global has published conservation targets for its destinations and runs coastal restoration work, including mangroves. Two parts of that work sit close to ours: tracking vegetation and shoreline change at low cost between field visits, and choosing native salt-tolerant species for landscaping and restoration areas where soil and irrigation water are saline.

We propose a small pilot. Satellite monitoring of vegetation and shoreline for one planted or protected site, drone surveys flown by licensed pilots for ground truth, and a short species note for your landscaping team.

Could we present the approach to your sustainability or environment team?

{sender}
{company}`,
  },
  {
    id: 'acwa', name: 'ACWA Power', kind: 'Client', group: 'Middle East', where: 'Saudi Arabia · projects worldwide', site: 'https://acwapower.com', fit: 88, value: 120, disc: true,
    lines: ['cr3', 'dm5', 'kp7'], halo: ['hs6', 'hs2'], to: 'Water and desalination technology team',
    why: 'A large desalination portfolio makes reject brine a recurring cost and permitting item. A halophyte reuse route would be a new option for it.',
    facts: ['Develops, owns and operates power and desalinated-water assets internationally', 'Describes itself as a leading private desalination company'],
    confirm: ['Current wording of its desalination positioning', 'Which team owns brine and discharge decisions', 'Whether it takes unsolicited technical proposals, and through which channel'],
    subject: 'Halophyte irrigation with reject brine: a desk screening for one of your plants',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes (salt-tolerant plants) and the field systems used to grow and monitor them.

ACWA Power develops and operates desalination plants at scale, so reject brine is a standing cost and permitting question for you. We study whether part of that brine can irrigate halophyte crops such as Salicornia and Atriplex, with the plants returning forage, seed oil or biomass and reducing the volume discharged.

We can prepare a short desk screening for one plant of your choice: brine chemistry fit, land and climate suitability, and a first range for yield and economics. We would need only the location and a typical reject-brine analysis.

Would a 20-minute call with whoever owns brine management be possible?

{sender}
{company}`,
  },
  {
    id: 'sfp', name: 'Sahara Forest Project', kind: 'Partner', group: 'Europe', where: 'Norway · demonstration sites in Jordan and Qatar', site: 'https://www.saharaforestproject.com', fit: 90, value: 80, disc: true,
    lines: ['dm1', 'dm2', 'dm4', 'kp1'], halo: ['hs1', 'hs2', 'hs6'], to: 'Project development team',
    why: 'It already grows salt-tolerant plants at demonstration scale. Monitoring those plots is repetitive work our survey pipeline is built for, and a joint grant could fund both sides.',
    facts: ['Combines saltwater-cooled greenhouses with outdoor cultivation of salt-tolerant plants', 'Has built demonstration sites including one in Aqaba, Jordan'],
    confirm: ['Which sites are operating today', 'Whether it accepts external research collaborations', 'Contact route for project development'],
    subject: 'Drone and sensor monitoring for halophyte fields: a collaboration idea',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes and on drones and ground robots for field work.

Sahara Forest Project has built demonstration sites that combine saltwater-cooled greenhouses with outdoor cultivation of salt-tolerant plants. Monitoring such plots at scale (canopy cover, plant stress, soil salinity) is repetitive work that automated surveys handle well, and it is where we spend most of our development time.

We would like to test our survey pipeline on one of your halophyte plots, share the results openly with your team, and explore whether a joint funding application makes sense for both of us.

Is there someone on your project development side we could speak to for 20 minutes?

{sender}
{company}`,
  },
  {
    id: 'wwd', name: 'Westlands Water District', kind: 'Public body', group: 'North America', where: 'United States · California', site: 'https://wwd.ca', fit: 79, value: 110, disc: true,
    lines: ['dm4', 'dm1', 'cr4', 'kp3'], halo: ['hs5', 'hs2', 'hs1'], to: 'Water resources and land use staff',
    why: 'Salinity and drainage limits are long-standing on its land, and groundwater rules are changing how land is used. Salt-tolerant crops give some fields an income path.',
    facts: ['Agricultural water district on the west side of the San Joaquin Valley', 'Salinity and drainage limits affect land in the district', 'State groundwater rules are changing how land is used'],
    confirm: ['Current land-repurposing programmes', 'Who handles water resources or land-use partnerships', 'Procurement route for studies'],
    subject: 'Salt-tolerant crop and halophyte options for drainage-impaired land',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes (salt-tolerant plants) and automated field monitoring.

Westlands Water District covers farmland in the San Joaquin Valley where salinity and drainage limits are long-standing, and where groundwater rules are changing how land is used. For fields that are hard to farm conventionally, salt-tolerant crops and halophytes can offer an income path while keeping water use low.

We can prepare a desk study of halophyte and salt-tolerant crop options for drainage-impaired soils, with soil-salinity mapping from satellite and drone data for one sample parcel.

Would the right contact at the District be someone in water resources or land use?

{sender}
{company}`,
  },
  {
    id: 'ssmp', name: 'Salton Sea Management Program', kind: 'Public body', group: 'North America', where: 'United States · California', site: 'https://saltonsea.ca.gov', fit: 83, value: 95, disc: true,
    lines: ['dm1', 'dm8', 'fs9', 'cn4'], halo: ['hs5', 'hs7'], to: 'Programme team',
    why: 'Vegetation on saline lakebed is hard to establish and costly to track on foot. Satellite plus drone monitoring and species trials answer both problems.',
    facts: ['State programme led by the California Natural Resources Agency', 'Builds habitat and dust-suppression projects on lakebed exposed as the Salton Sea recedes'],
    confirm: ['Current project list and species used', 'Procurement and pilot-proposal route', 'Monitoring methods already in use'],
    subject: 'Monitoring vegetation on exposed lakebed, and salt-tolerant species trials',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes and on drones for vegetation monitoring.

The Salton Sea Management Program is building habitat and dust-suppression projects on lakebed exposed as the Sea recedes. Vegetation on saline playa is difficult to establish and expensive to track on foot.

We would like to offer two things: a species and establishment review for salt-tolerant plants on saline lakebed soils, and a low-cost monitoring method that combines satellite data with drone surveys to report cover and condition on a fixed schedule.

Could you point us to the right team or procurement route for pilot proposals?

{sender}
{company}`,
  },
  {
    id: 'sqm', name: 'SQM', kind: 'Client', group: 'South America', where: 'Chile', site: 'https://www.sqm.com', fit: 77, value: 140, disc: true,
    lines: ['dm1', 'dm2', 'cn4', 'cr5'], halo: ['hs5'], to: 'Environment and sustainability team',
    why: 'Operations in a salt flat come with regulated vegetation and water monitoring. More frequent automated measurement can sit beside its existing methods.',
    facts: ['Operates lithium and specialty-chemical production in the Salar de Atacama', 'Vegetation and water are monitored as part of environmental compliance'],
    confirm: ['Scope of its current environmental monitoring programmes', 'Contact route in environment or sustainability', 'Any limits on third-party monitoring near operations'],
    subject: 'Automated vegetation monitoring for salt-flat margins',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes and on drone and satellite monitoring.

SQM operates in the Salar de Atacama, where vegetation and water are tracked as part of environmental compliance. We build automated multispectral monitoring meant to sit alongside existing programmes. It raises how often vegetation condition is measured without replacing field campaigns or your current methods.

We can propose a pilot over a defined area: monthly satellite indices, periodic drone surveys, and a comparison with your existing field data, with all data and methods open to your team.

Who in environment or sustainability should we send a technical proposal to?

{sender}
{company}`,
  },
  {
    id: 'rsf', name: 'Red Sea Farms', kind: 'Partner', group: 'Middle East', where: 'Saudi Arabia', site: 'https://www.redseafarms.com', fit: 86, value: 60, disc: false,
    lines: ['dm4', 'dm1', 'fs8', 'kp3'], halo: ['hs1', 'hs5'], to: 'Agronomy and partnerships lead',
    why: 'It already farms with saline irrigation water, so drainage water and soil salt build-up are daily agronomy. Halophyte cash crops and early salt-stress detection fit beside that.',
    facts: ['Grows crops using saline irrigation water', 'Agricultural technology company with a saline-agriculture focus'],
    confirm: ['Its crop portfolio and sites today', 'Official contact channel', 'Whether it already runs halophyte or remote-sensing programmes'],
    subject: 'Halophyte rotation and salt-stress monitoring for saline-water farms',
    body: `Hello,

{company} is an early-stage environmental science company focused on halophytes (salt-tolerant plants) and automated field monitoring.

Red Sea Farms grows crops with saline irrigation water, so drainage water and salt build-up in soil are part of daily agronomy. We work on two things that could sit beside that: halophyte cash crops (for example Salicornia or Atriplex) that can use the most saline drainage streams, and remote sensing that flags salt stress in the field before yield loss shows.

We can prepare a brief on which halophyte species fit your climate and water chemistry, and propose a monitoring trial on one of your fields.

Would your agronomy or partnerships lead be open to a short call?

{sender}
{company}`,
  },
  {
    id: 'icba', name: 'International Center for Biosaline Agriculture', kind: 'Partner', group: 'Middle East', where: 'United Arab Emirates', site: 'https://www.biosaline.org', fit: 84, value: 90, disc: false,
    lines: ['kp1', 'dm10', 'kp9', 'kp3'], halo: ['hs2', 'hs1', 'hs5'], to: 'Partnerships and research programme leads',
    why: 'Its research on crops and forages for saline and marginal land is the most direct match to our halophyte work. We bring consistent field data across many plots.',
    facts: ['International research centre in Dubai focused on agriculture in saline and marginal environments'],
    confirm: ['Current research programmes and leads', 'Partnership process and data-sharing terms'],
    subject: 'Joint halophyte trials with automated monitoring',
    body: `Hello,

{company} is an early-stage environmental science company that works on halophytes and on drones and robots for field monitoring.

ICBA's research on crops and forages for saline and marginal land is directly relevant to our work. What we can add is long-running field data collected consistently across many plots, which is what our monitoring pipeline is designed to produce.

We would like to propose a joint trial design: your species and site knowledge, our automated imaging and data pipeline, with results shared with both teams and a path to co-authored publications or a joint funding application.

Could we set up a call with the relevant research programme lead?

{sender}
{company}`,
  },
  {
    id: 'masdar', name: 'Masdar', kind: 'Client', group: 'Middle East', where: 'United Arab Emirates', site: 'https://masdar.ae', fit: 81, value: 70, disc: false,
    lines: ['kp7', 'kp3', 'cn6', 'cn1'], halo: ['hs3', 'hs1', 'hs2'], to: 'Innovation and bioenergy team',
    why: 'It took part in an earlier seawater-grown Salicornia pilot. Interest in halophytes has since widened to food, forage and plant salt, which changes the economics.',
    facts: ['Abu Dhabi clean-energy company', 'Took part in the Seawater Energy and Agriculture System pilot, which grew Salicornia on seawater for biofuel research'],
    confirm: ["Masdar's exact role in the pilot and its current status", 'Which team handles bioenergy or innovation partnerships'],
    subject: 'Updating halophyte feedstock economics with drone-monitored plots',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes (salt-tolerant plants) and field automation.

Masdar took part in the Seawater Energy and Agriculture System pilot in Abu Dhabi, which grew Salicornia on seawater for biofuel research. Since then, interest in halophyte crops has widened beyond fuel to food, forage and plant salt.

We can write a short update on where halophyte value chains stand for UAE conditions, and propose a small plot trial with automated monitoring that produces current yield and water-use data.

Would your innovation or bioenergy team be open to a 20-minute conversation?

{sender}
{company}`,
  },
  {
    id: 'sff', name: 'Salt Farm Foundation', kind: 'Partner', group: 'Europe', where: 'Netherlands · Texel', site: '', fit: 82, value: 50, disc: false,
    lines: ['dm2', 'dm1', 'kp1', 'kp10'], halo: ['hs1', 'hs5'], to: 'Research team',
    why: 'Season-long comparison of plots at different salinities depends on manual measurement. Scheduled drone and sensor capture is a clean test of our pipeline.',
    facts: ['Runs saline cultivation trials on the island of Texel', 'Trials compare crops across salinity levels'],
    confirm: ['Current trial design and crops', 'Website and contact route', 'Openness to external imaging or data collaborations'],
    subject: 'Automated imaging for saline crop trials on Texel',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes and automated field monitoring.

Salt Farm Foundation runs saline cultivation trials on Texel, with crops grown across a range of salinity levels. Comparing plots over a season usually depends on manual measurements. We are building drone and sensor workflows that capture canopy and stress indicators on a fixed schedule, and we would like to test them on trial plots.

We can offer to fly and process a pilot dataset, share the full data and methods with your team, and discuss whether a joint EU funding proposal fits both organisations.

Who on your research team would be best to talk to?

{sender}
{company}`,
  },
  {
    id: 'mdba', name: 'Murray–Darling Basin Authority', kind: 'Public body', group: 'Oceania', where: 'Australia', site: 'https://www.mdba.gov.au', fit: 74, value: 85, disc: false,
    lines: ['dm4', 'dm1', 'kp2', 'kp3'], halo: ['hs5', 'hs2'], to: 'Salinity and water quality team',
    why: 'Salt-tolerant perennial plantings are an established salinity tool. Tracking their establishment across wide areas is where satellite and drone monitoring add the most.',
    facts: ['Australian federal authority responsible for the Basin Plan', 'Maintains a basin salinity management strategy'],
    confirm: ['Name and current version of the salinity strategy', 'Contact for salinity research partnerships', 'Supplier registration or tender route'],
    subject: 'Halophyte revegetation and remote salinity monitoring for the Basin',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes (salt-tolerant plants) and automated monitoring.

The Murray–Darling Basin Authority maintains a salinity strategy for the Basin. Salt-tolerant perennial plantings such as saltbush are one established tool on saline land, and tracking their establishment and effect across wide areas is where satellite and drone monitoring can add the most.

We propose a desk review of current evidence on salt-tolerant plantings under Basin conditions, followed by a monitoring pilot on a partner site that compares satellite indicators with ground EC measurements.

Which team handles salinity research partnerships, and is there a supplier registration route we should follow?

{sender}
{company}`,
  },
  {
    id: 'wi', name: 'Wetlands International', kind: 'Partner', group: 'Global', where: 'Netherlands · programmes worldwide', site: 'https://www.wetlands.org', fit: 80, value: 75, disc: false,
    lines: ['cn1', 'cn2', 'cn6', 'dm2', 'dm7'], halo: ['hs7'], to: 'Coastal restoration programme team',
    why: 'Restoration sites need survival and sediment evidence that funders and registries accept. Low-cost drone and satellite monitoring can supply it.',
    facts: ['Global non-profit working on wetland conservation and restoration', 'Has worked on mangrove restoration that combines hydrology and planting, including the Demak coast in Indonesia'],
    confirm: ['Current mangrove programmes and monitoring needs', 'Programme team contact', 'Evidence requirements of its funders and registries'],
    subject: 'Drone and satellite monitoring for mangrove restoration sites',
    body: `Hello,

{company} is an early-stage environmental science company working on halophytes, including coastal species, and on automated monitoring.

Wetlands International has worked on mangrove restoration approaches that combine hydrology and sediment management with planting, including the work on the Demak coast in Indonesia. Survival and sediment change on restoration sites are hard to track at low cost.

We would like to pilot drone and satellite monitoring on one restoration site, reporting canopy cover, shoreline change and planting survival, and to learn from your team what evidence funders and registries ask for.

Could we have a call with the programme team that handles coastal restoration monitoring?

{sender}
{company}`,
  },
];
