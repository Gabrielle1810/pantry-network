// Mocked data for the Pantry Network demo. All campuses, people and numbers are invented.

window.CATEGORIES = {
  'Canned Goods':              { group: 'Meal Essentials',           icon: 'cylinder',    bg: '#fdefe9', fg: '#b4532a' },
  'Dried Pasta/Grains':        { group: 'Meal Essentials',           icon: 'wheat',       bg: '#f8f0e6', fg: '#8a5a2e' },
  'Sauces/Pastes/Spread':      { group: 'Meal Essentials',           icon: 'cooking-pot', bg: '#fceef1', fg: '#a83a55' },
  'Dried/Canned Meats/Protein':{ group: 'Meal Essentials',           icon: 'fish',        bg: '#fdefe9', fg: '#b4532a' },
  'Cereal':                    { group: 'Meal Essentials',           icon: 'coffee',      bg: '#fff5e0', fg: '#b7791f' },
  'Microwave cup/package':     { group: 'Microwavable/Instant Meal', icon: 'soup',        bg: '#e9f5f3', fg: '#2a7a70' },
  'Granola Bar/Cracker Snacks':{ group: 'Grab & Go Snacks',          icon: 'cookie',      bg: '#f3edfa', fg: '#6b4fa0' },
  'Fruit Cups/Pouches':        { group: 'Grab & Go Snacks',          icon: 'apple',       bg: '#eef7e9', fg: '#3e7a2e' },
  'Drinks/Juice/Milk/Protein': { group: 'Drinks & Beverages',        icon: 'milk',        bg: '#ecf2fc', fg: '#2f5ea8' },
  'Baking':                    { group: 'Other Pantry Staples',      icon: 'chef-hat',    bg: '#f8f0e6', fg: '#8a5a2e' },
  'Oils/Vinegar':              { group: 'Other Pantry Staples',      icon: 'droplet',     bg: '#fff5e0', fg: '#b7791f' },
  'Spices':                    { group: 'Other Pantry Staples',      icon: 'leaf',        bg: '#eef7e9', fg: '#3e7a2e' },
  'Hygiene Items':             { group: 'Hygiene Items',             icon: 'spray-can',   bg: '#ecf2fc', fg: '#2f5ea8' },
};

// Short labels for the student page's category chips
window.STUDENT_GROUPS = [
  ['All', null],
  ['Meal Essentials', 'Meal Essentials'],
  ['Instant meals', 'Microwavable/Instant Meal'],
  ['Snacks', 'Grab & Go Snacks'],
  ['Drinks', 'Drinks & Beverages'],
  ['Staples', 'Other Pantry Staples'],
  ['Hygiene', 'Hygiene Items'],
];

window.CAMPUSES = {
  harbor:    { name: 'Harbor University',         mi: 0,  region: 'Greater Boston' },
  cedar:     { name: 'Cedar Hill College',        mi: 6,  region: 'Greater Boston', place: 'Library basement, room B12', hours: 'Mon to Thu, 11 am to 3 pm', contact: 'Sam Ortiz, pantry lead · pantry@cedarhill.example' },
  northfield:{ name: 'Northfield College',        mi: 14, region: 'MetroWest',      place: 'Campus food pantry, Student Center room 112', hours: 'Weekdays, 10 am to 4 pm', contact: 'Jordan Lee, pantry manager · pantry@northfield.example' },
  riverside: { name: 'Riverside State',           mi: 41, region: 'Central MA',     place: 'Wellness Center loading dock', hours: 'Tue and Thu, 9 am to 1 pm', contact: 'Priya Nair · basicneeds@riverside.example' },
  bayview:   { name: 'Bayview Community College', mi: 58, region: 'South Coast',    place: 'Building C, room 140', hours: 'Mon, Wed, Fri, noon to 5 pm', contact: 'Chris Dube · pantry@bayview.example' },
  hillcrest: { name: 'Hillcrest University',      mi: 88, region: 'Pioneer Valley', place: 'Campus Center, room 205', hours: 'Weekdays, 1 pm to 6 pm', contact: 'Alex Kim · foodshelf@hillcrest.example' },
};

// What the "camera" reads, in order, on the Add stock screen
window.MOCK_READS = [
  { name: 'Tomato paste', brand: "Hunt's", unit: 'can', category: 'Sauces/Pastes/Spread', expires: '2026-10-26', color: '#b8442e', label: "HUNT'S" },
  { name: 'Black beans', brand: 'Goya', unit: 'can', category: 'Canned Goods', expires: null, color: '#1f3a6b', label: 'GOYA' },
  { name: 'Granola bars', brand: 'Nature Valley', unit: 'bar', category: 'Granola Bar/Cracker Snacks', expires: '2027-04-12', color: '#3e7a2e', label: 'NATURE VALLEY' },
  { name: 'Cereal (Cheerios)', brand: 'General Mills', unit: 'cup', category: 'Cereal', expires: '2027-01-15', color: '#d9a21b', label: 'CHEERIOS' },
];

window.SEED = function () {
  const it = (id, name, brand, unit, category, qty, of, expires, restock, source, extra = {}) =>
    ({ id, name, brand, unit, category, qty, of, expires, restock, source, noExpire: false, history: [], ...extra });

  const items = [
    it('vinegar',  'White distilled vinegar',      'Wegmans',       'bottle', 'Oils/Vinegar',               2,   2,   null,         '2026-06-11', 'purchased'),
    it('cookiemix','Chocolate chip cookie mix',    'Betty Crocker', 'bag',    'Baking',                     1,   1,   '2026-06-19', '2026-06-11', 'donated'),
    it('chickarina','Chickarina soup',             'Progresso',     'can',    'Canned Goods',               1,   1,   '2026-09-26', '2026-06-11', 'donated'),
    it('tomato',   'Tomato paste',                 "Hunt's",        'can',    'Sauces/Pastes/Spread',       2,   4,   '2026-10-26', '2026-06-11', 'purchased'),
    it('rice',     'Jasmine rice',                 'So Natural',    'bag',    'Dried Pasta/Grains',         4,   6,   null,         '2026-06-29', 'purchased'),
    it('pbmilk',   'Plant based milk',             'Ripple',        'bottle', 'Drinks/Juice/Milk/Protein',  3,   12,  null,         '2026-06-29', 'donated'),
    it('ramen',    'Ramen noodles (chicken)',      'Maruchan',      'cup',    'Microwave cup/package',      9,   12,  null,         '2026-06-29', 'purchased'),
    it('soymilk',  'Soy milk',                     'Silk',          'bottle', 'Drinks/Juice/Milk/Protein',  5,   12,  '2026-11-16', '2026-06-02', 'donated'),
    it('applesauce','Applesauce pouches',          "Mott's",        'pouch',  'Fruit Cups/Pouches',         20,  32,  '2026-11-28', '2026-06-02', 'donated'),
    it('beans',    'Black beans',                  'Goya',          'can',    'Canned Goods',               3,   16,  null,         '2026-06-02', 'purchased'),
    it('pb',       'Peanut butter (single serve)', 'Jif',           'packet', 'Sauces/Pastes/Spread',       150, 200, '2026-12-18', '2026-06-02', 'donated'),
    it('cheerios', 'Cereal (Cheerios)',            'General Mills', 'cup',    'Cereal',                     0,   12,  null,         '2026-06-02', 'donated'),
    it('penne',    'Penne pasta',                  'Barilla',       'box',    'Dried Pasta/Grains',         10,  24,  null,         '2026-06-15', 'purchased'),
    it('granola',  'Granola bars',                 'Nature Valley', 'bar',    'Granola Bar/Cracker Snacks', 18,  40,  '2027-03-02', '2026-06-15', 'donated'),
    it('corn',     'Canned corn',                  'Del Monte',     'can',    'Canned Goods',               5,   24,  '2027-05-01', '2026-06-15', 'purchased'),
    it('macncheese','Mac and cheese cups',         'Kraft',         'cup',    'Microwave cup/package',      14,  24,  '2026-11-02', '2026-06-20', 'donated'),
    it('tuna',     'Tuna',                         'StarKist',      'can',    'Dried/Canned Meats/Protein', 7,   20,  null,         '2026-06-20', 'purchased'),
    it('oatmeal',  'Oatmeal packets',              'Quaker',        'packet', 'Cereal',                     25,  50,  '2027-01-10', '2026-06-20', 'donated'),
    it('sauce',    'Spaghetti sauce',              'Prego',         'jar',    'Sauces/Pastes/Spread',       5,   8,   '2026-08-30', '2026-06-08', 'purchased'),
    it('peaches',  'Peach fruit cups',             'Dole',          'cup',    'Fruit Cups/Pouches',         12,  24,  '2026-07-15', '2026-06-08', 'donated'),
    it('chickensoup','Chicken noodle soup',        "Campbell's",    'can',    'Canned Goods',               4,   12,  '2026-10-01', '2026-06-08', 'donated'),
    it('juice',    'Apple juice boxes',            'Juicy Juice',   'box',    'Drinks/Juice/Milk/Protein',  2,   10,  '2026-10-12', '2026-06-08', 'donated'),
    it('flour',    'All-purpose flour',            'King Arthur',   'bag',    'Baking',                     2,   3,   '2027-02-20', '2026-06-11', 'purchased'),
    it('cinnamon', 'Ground cinnamon',              'McCormick',     'jar',    'Spices',                     1,   2,   null,         '2026-06-11', 'donated'),
    it('oil',      'Olive oil',                    'Bertolli',      'bottle', 'Oils/Vinegar',               3,   4,   '2027-08-01', '2026-06-11', 'purchased'),
    it('toothpaste','Toothpaste',                  'Colgate',       'tube',   'Hygiene Items',              8,   10,  null,         '2026-06-29', 'donated', { noExpire: true }),
    it('shampoo',  'Shampoo, travel size',         'Suave',         'bottle', 'Hygiene Items',              2,   12,  null,         '2026-06-29', 'donated', { noExpire: true }),
    it('crackers', 'Peanut butter crackers',       'Lance',         'pack',   'Granola Bar/Cracker Snacks', 16,  24,  '2026-11-01', '2026-06-29', 'purchased'),
  ];
  items.forEach(i => i.history.push({ at: Date.parse(i.restock + 'T10:00:00'), text: `Added ${i.of} ${i.unit}${i.of === 1 ? '' : 's'} (${i.source})` }));
  items.find(i => i.id === 'tomato').history.push({ at: Date.parse('2026-06-11T10:05:00'), text: 'Best by corrected from 10/20 to 10/26' });

  const min = m => Date.now() - m * 60000;
  const feed = [
    { id: 'f1',  at: min(2),   source: 'student', items: [{ id: 'beans', qty: 2 }, { id: 'ramen', qty: 1 }] },
    { id: 'f2',  at: min(10),  source: 'staff', reason: 'Expired', by: 'Maya', items: [{ id: 'cookiemix', qty: 1 }, { id: 'chickarina', qty: 1 }] },
    { id: 'f3',  at: min(14),  source: 'student', items: [{ id: 'rice', qty: 1 }] },
    { id: 'f4',  at: min(25),  source: 'staff', reason: 'Given out by hand', items: [{ id: 'beans', qty: 2 }] },
    { id: 'f5',  at: min(41),  source: 'student', items: [{ id: 'pb', qty: 3 }, { id: 'applesauce', qty: 2 }] },
    { id: 'f6',  at: min(60),  source: 'student', items: [{ id: 'ramen', qty: 2 }, { id: 'soymilk', qty: 1 }, { id: 'granola', qty: 2 }] },
    { id: 'f7',  at: min(64),  source: 'student', items: [{ id: 'beans', qty: 3 }] },
    { id: 'f8',  at: min(95),  source: 'student', items: [{ id: 'ramen', qty: 4 }, { id: 'crackers', qty: 2 }] },
    { id: 'f9',  at: min(130), source: 'student', items: [{ id: 'macncheese', qty: 2 }, { id: 'ramen', qty: 3 }] },
    { id: 'f10', at: min(180), source: 'staff', reason: 'Damaged', items: [{ id: 'oatmeal', qty: 2 }] },
    { id: 'f11', at: min(240), source: 'student', items: [{ id: 'ramen', qty: 2 }, { id: 'pbmilk', qty: 1 }] },
  ];

  const offers = [
    { id: 'o1', campus: 'riverside',  name: 'Canned corn',          unit: 'can',    qty: 48,  expires: '2026-11-08', category: 'Canned Goods' },
    { id: 'o2', campus: 'northfield', name: 'Cereal cups',          unit: 'cup',    qty: 24,  expires: '2027-01-15', category: 'Cereal' },
    { id: 'o3', campus: 'cedar',      name: 'Applesauce pouches',   unit: 'pouch',  qty: 40,  expires: '2026-12-01', category: 'Fruit Cups/Pouches' },
    { id: 'o4', campus: 'cedar',      name: 'Shampoo, travel size', unit: 'bottle', qty: 25,  expires: null, noExpire: true, category: 'Hygiene Items' },
    { id: 'o5', campus: 'northfield', name: 'Penne pasta',          unit: 'box',    qty: 30,  expires: null, category: 'Dried Pasta/Grains' },
    { id: 'o6', campus: 'riverside',  name: 'Snack bars',           unit: 'bar',    qty: 120, expires: '2027-03-02', category: 'Granola Bar/Cracker Snacks' },
    { id: 'o7', campus: 'bayview',    name: 'Peanut butter',        unit: 'jar',    qty: 12,  expires: '2027-02-01', category: 'Sauces/Pastes/Spread' },
    { id: 'o8', campus: 'hillcrest',  name: 'Ramen cups',           unit: 'cup',    qty: 60,  expires: null, category: 'Microwave cup/package' },
  ];

  const requests = [
    { id: 'r1', campus: 'bayview',   name: 'Peanut butter packets', category: 'Sauces/Pastes/Spread', qty: 30, matchId: 'pb' },
    { id: 'r2', campus: 'riverside', name: 'Canned vegetables',     category: 'Canned Goods',         qty: 20, matchId: 'corn' },
    { id: 'r3', campus: 'cedar',     name: 'Toothpaste',            category: 'Hygiene Items',        qty: 15, matchId: 'toothpaste' },
  ];

  const myOffers = [
    { id: 'm1', itemId: 'pb',     qty: 40, at: min(60 * 26), status: 'open' },
    { id: 'm2', itemId: 'oatmeal', qty: 10, at: min(60 * 50), status: 'claimed', claimedBy: 'cedar' },
  ];

  return { items, feed, offers, requests, myOffers, myRequests: [], pickups: [], dismissed: {} };
};
