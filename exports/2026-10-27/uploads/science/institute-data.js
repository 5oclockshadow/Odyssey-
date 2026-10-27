export const PROGRAMMES = [
  { id: 'hal', name: 'Halophyte biology and agronomy', tag: 'Flagship', lead: 'Programme lead, halophyte agronomy',
    mission: 'Bring salt-tolerant crops into reliable production on land and water that conventional agriculture cannot use.',
    qs: ['How do yield and quality of Salicornia and Atriplex respond to salinity, planting density and season?', 'Which species and cultivars suit each climate and water chemistry?', 'What does a halophyte crop cost to grow and harvest at 1, 10 and 100 hectares?'],
    projects: [['Multi-site yield trials, Sites A to C', 'Design'], ['Seed and plug supply chain', 'Concept'], ['Quality and food-safety profile of edible halophytes', 'Planned']],
    methods: ['Randomised plot trials', 'Tissue analysis', 'Yield modelling', 'Techno-economics'], outputs: ['Open trial protocols', 'Yield dataset by salinity and season'] },
  { id: 'brine', name: 'Brine and saline water systems', tag: 'Core', lead: 'Programme lead, saline hydrology',
    mission: 'Turn desalination reject brine and saline drainage water into an input for crops and salt products.',
    qs: ['How much brine can halophyte beds take up per hectare per season?', 'How should beds, evaporation and salt harvest be sequenced?', 'What do discharge rules and permits require of a reuse route?'],
    projects: [['Brine mass-balance model', 'Running in simulation'], ['Pilot bed design', 'Concept'], ['Salt-harvest scheduling', 'Running in simulation']],
    methods: ['Mass balance', 'Hydraulic modelling', 'Water chemistry', 'Life-cycle assessment'], outputs: ['Reference design for a 1,000 m³ a day plant', 'Open model and spreadsheet'] },
  { id: 'blue', name: 'Coastal and blue carbon', tag: 'Core', lead: 'Programme lead, coastal ecology',
    mission: 'Restore salt marsh and mangrove with monitoring that registries and funders accept.',
    qs: ['Which early signals predict planting survival?', 'How do carbon stocks develop in restored tidal wetlands under local conditions?', 'What evidence do registries require under tidal-wetland methodologies?'],
    projects: [['Survival monitoring from drones', 'Concept'], ['Carbon baseline sampling design', 'Design'], ['Methodology gap review (VM0033)', 'Planned']],
    methods: ['Soil cores', 'Drone and satellite imagery', 'Sediment elevation tables', 'eDNA'], outputs: ['Monitoring protocol', 'Open baseline template'] },
  { id: 'rs', name: 'Remote sensing and environmental data', tag: 'Core', lead: 'Programme lead, remote sensing',
    mission: 'Measure salinity, vegetation and shoreline change from space and air, checked against ground truth.',
    qs: ['How well can soil EC be predicted from satellite and drone bands?', 'How often must ground samples refresh a model?', 'How should uncertainty be reported to clients?'],
    projects: [['Salinity mapping from imagery', 'Running in simulation'], ['Vegetation time-series service', 'Design'], ['MRV dashboard', 'Concept']],
    methods: ['Multispectral indices', 'Machine learning', 'Geostatistics', 'Uncertainty reporting'], outputs: ['Open baseline model', 'Validation datasets'] },
  { id: 'auto', name: 'Field autonomy: drones and ground robots', tag: 'Largest share of effort', lead: 'Autonomy lead and robotics lead',
    mission: 'Replace repeat field tasks with machines that work safely under human supervision.',
    qs: ['What mission success rate and abort logic make survey flights safe enough to supervise remotely?', 'Can a tracked robot travel and plant on soft tidal mud?', 'Which tasks justify a machine and which stay with people?'],
    projects: [['Survey drone autonomy', 'Running in simulation'], ['Ground robot for soft mud', 'Running in simulation'], ['Plug-transplant end effector', 'Running in simulation']],
    methods: ['Simulation', 'Hardware in the loop', 'Controlled field tests', 'Safety cases'], outputs: ['Published safety case', 'Open simulation scenarios'] },
  { id: 'fin', name: 'Nature finance and compliance science', tag: 'Growing', lead: 'Programme lead, environmental reporting',
    mission: 'Make environmental reporting and nature-related disclosure rigorous and cheaper to produce.',
    qs: ['Which biodiversity metrics hold up under audit?', 'How can satellite and eDNA evidence feed TNFD and CSRD disclosures?', 'How do we detect weak green claims?'],
    projects: [['TNFD evidence pack', 'Concept'], ['CSRD E3 and E4 gap tool', 'Design'], ['Green-claims reviewer', 'Concept']],
    methods: ['Standards mapping', 'Evidence grading', 'eDNA', 'Audit trails'], outputs: ['Open gap-assessment templates'] },
  { id: 'edu', name: 'Education and extension', tag: 'Growing', lead: 'Academy director',
    mission: 'Train growers, officers and students to farm and restore salty land.',
    qs: ['Which practices do farmers adopt, and why?', 'Which training formats work with low bandwidth?'],
    projects: [['Saline agriculture course', 'Planned'], ['Field manual', 'Drafting'], ['Extension-officer workshops', 'Planned']],
    methods: ['Field days', 'Open courseware', 'Adoption surveys'], outputs: ['Open field manual', 'Course materials'] },
];

export const SPECIES = [
  ['Glasswort, sea asparagus', 'Salicornia europaea, S. bigelovii', 'Succulent annual', 'Vegetable, seed oil, plant salt', 'Lead crop'],
  ['Perennial glasswort', 'Sarcocornia and Arthrocnemum species', 'Succulent perennial', 'Vegetable, marsh restoration', 'Trial'],
  ['Seablite', 'Suaeda maritima, S. fruticosa', 'Succulent shrub or annual', 'Leaves, seed oil, forage', 'Trial'],
  ['Agretti', 'Salsola soda', 'Annual', 'Vegetable for Mediterranean markets', 'Trial'],
  ['Old man saltbush', 'Atriplex nummularia', 'Perennial shrub', 'Forage, land reclamation', 'Lead forage'],
  ['Mediterranean saltbush', 'Atriplex halimus', 'Perennial shrub', 'Forage, windbreak', 'Trial'],
  ['Saltgrass', 'Distichlis spicata', 'Perennial grass', 'Turf, forage, dust control', 'Trial'],
  ['Sea purslane', 'Sesuvium portulacastrum', 'Succulent perennial', 'Vegetable, soil remediation', 'Trial'],
  ['Seashore mallow', 'Kosteletzkya pentacarpos', 'Perennial herb', 'Oilseed, biomass', 'Research'],
  ['Rock samphire', 'Crithmum maritimum', 'Perennial herb', 'Culinary, cosmetic extracts', 'Research'],
  ['Cordgrass', 'Spartina alterniflora, S. anglica', 'Marsh grass', 'Shoreline protection, marsh restoration', 'Restoration only, screened for invasiveness'],
  ['Mangroves', 'Avicennia, Rhizophora and others', 'Woody trees', 'Coastal protection, blue carbon', 'Restoration partners'],
];

export const FACILITIES = [
  ['Site A, coastal Iberia', 'Halophyte yield trials and a drone test range', 'Planned'],
  ['Site B, Gulf coast', 'Brine-irrigation pilot beds', 'Planned'],
  ['Site C, tidal flat, Australia', 'Ground-robot mud trials and survey flights', 'Planned'],
  ['Soil and water laboratory', 'Salinity, ions, nutrients and tissue analysis', 'Planned'],
  ['Plant growth facility', 'Greenhouse and growth rooms for salinity screens', 'Planned'],
  ['Robotics and flight bay', 'Build, test and maintain aircraft and ground robots', 'Planned'],
  ['Data platform', 'Pipeline for imagery, sensors, models and agent runtime', 'Prototype running'],
];

export const ORG = [
  ['Directorate', ['Institute director', 'Chief scientist', 'Head of operations']],
  ['Research programmes', ['Seven programme leads, one for each programme']],
  ['Field operations', ['Regional crew leads for Iberia, the Gulf, Australia, California and Chile']],
  ['Engineering', ['Autonomy lead, aircraft', 'Robotics lead, ground', 'Data engineering lead']],
  ['Partnerships and funding', ['Partnerships lead', 'Grants lead', 'Finance and compliance']],
  ['Safety and quality', ['Accountable manager for flight operations', 'Safety officer', 'Quality and data steward']],
];

export const BOARD = ['Halophyte biology', 'Saline hydrology', 'Remote sensing', 'Robotics and aviation safety', 'Blue carbon and coastal science', 'Agricultural economics'];

export const POLICIES = [
  ['Open science', 'Protocols, models and datasets are published under open licences. Client work is labelled as client work, and data stays confidential only where a contract requires it.'],
  ['Independence', 'No client can change a finding. Commercial relationships are listed on every report, and staff declare conflicts before work starts.'],
  ['Human accountability', 'Agents draft, plan and analyse. A named person approves anything outbound, any field deployment and any published claim.'],
  ['Aviation and robot safety', 'Licensed pilots fly under a documented risk assessment. Autonomous operations start only after approval in the country concerned and an external safety review.'],
  ['Biosecurity', 'Every species is screened for invasiveness before it leaves a laboratory or trial plot. No plant is introduced to a region where it is not already established without regulator consent.'],
  ['Community and land', 'Field work on community or Indigenous land requires free, prior and informed consent, and benefits are agreed in writing.'],
];

export const COURSES = [
  ['Saline agriculture fundamentals', 'Online, self-paced', 'Growers and students', 'Planned'],
  ['Halophyte nursery and transplant practice', 'Field, three days', 'Crews and growers', 'Planned'],
  ['Drone surveys for ecologists', 'Partner-delivered, licensed-pilot track', 'Ecologists', 'Planned'],
  ['MRV for tidal wetlands', 'Online', 'Project developers', 'Planned'],
  ['Environmental data in Python and R', 'Open notebooks', 'Analysts', 'Drafting'],
  ['Extension-officer workshop', 'In person, regional', 'Government extension staff', 'Planned'],
];

export const OUTPUTS = [
  ['Protocol', 'Plot imaging with a multispectral drone, v0.1', 'Lab Data', 'Drafting'],
  ['Dataset', 'Halophyte trait table', 'Lab Agro', 'Planned'],
  ['Software', 'Baseline model for salinity from imagery', 'Lab Data', 'Planned'],
  ['Preprint', 'Mass balance for a brine-irrigation loop', 'Lab Agro', 'Planned'],
  ['Manual', 'Salicornia transplanting and harvest', 'Academy', 'Planned'],
  ['Dataset', 'Trial plot time series: imagery and soil EC', 'Lab Data', 'Planned'],
];

export const FUNDING = [
  ['Client services', 'The 50 service lines and the halophyte core, sold to developers, utilities, growers and public bodies.', 'Active outreach'],
  ['Research grants', 'Public programmes for coastal, agricultural and climate research, matched to the R&D plan by the Funder agent.', 'Watchlist'],
  ['Joint trials', 'Shared trial costs with research centres and growers that already run saline sites.', 'Outreach drafted'],
  ['Data and model licences', 'Trait datasets and monitoring models offered through an API.', 'Concept'],
  ['Training fees', 'Academy courses and regional workshops.', 'Planned'],
  ['Prizes and philanthropy', 'Restricted gifts for open datasets and field-safety work.', 'Not started'],
];

export const MILESTONES = [
  ['Year 0', 'Write every field protocol. Seat the advisory board. Publish the first open protocol.'],
  ['Year 1', 'Run multi-site trial plots. Fly drone-assisted surveys with licensed pilots. Deliver the first client studies.'],
  ['Year 2', 'Release the first open dataset. Seek operating approvals for autonomous survey flights. Start a brine-loop pilot.'],
  ['Year 3', 'Put ground robots on our own trial plots. Teach the first Academy cohort.'],
  ['Year 4', 'Work on client sites with a mixed fleet under human supervision.'],
  ['Year 5', 'Machines carry most repeat field hours. Outside scientists review the institute.'],
];

export const FLOW = ['Clients and grants pay for studies and services', 'Services produce cash and field data', 'Cash and data fund R&D, 80% of agent time', 'R&D makes field work cheaper and safer', 'New capability opens new service lines'];
