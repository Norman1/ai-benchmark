const BONUS_SPECS = [
  {
    id: "canada",
    name: "Canada",
    value: 5,
    color: "#4168b5",
    territories: [
      ["canada_bc", "British Columbia", 265, 170],
      ["canada_alberta", "Alberta", 335, 158],
      ["canada_saskatchewan", "Saskatchewan", 410, 155],
      ["canada_ontario", "Ontario", 500, 165],
      ["canada_quebec", "Quebec", 590, 155],
      ["canada_labrador", "Labrador", 690, 125]
    ]
  },
  {
    id: "greenland",
    name: "Greenland",
    value: 5,
    color: "#d0403b",
    territories: [
      ["greenland_west", "West Greenland", 650, 75],
      ["greenland_north", "North Greenland", 730, 55],
      ["greenland_east", "East Greenland", 805, 80],
      ["greenland_south", "South Greenland", 720, 128],
      ["greenland_iceland", "Iceland", 845, 108]
    ]
  },
  {
    id: "central_america",
    name: "Central America",
    value: 3,
    color: "#c73637",
    territories: [
      ["central_america_mexico", "Mexico", 285, 360],
      ["central_america_panama", "Central America", 390, 405],
      ["central_america_cuba", "Cuba", 492, 370],
      ["central_america_caribbean", "Caribbean", 545, 410]
    ]
  },
  {
    id: "south_america",
    name: "South America",
    value: 4,
    color: "#5263bf",
    territories: [
      ["south_america_colombia", "Colombia", 555, 505],
      ["south_america_venezuela", "Venezuela", 620, 485],
      ["south_america_peru", "Peru", 570, 595],
      ["south_america_brazil", "Brazil", 690, 590],
      ["south_america_argentina", "Argentina", 640, 730]
    ]
  },
  {
    id: "antarctica",
    name: "Antarctica",
    value: 3,
    color: "#c99c22",
    territories: [
      ["antarctica_west", "West Antarctica", 520, 850],
      ["antarctica_central", "Central Antarctica", 745, 842],
      ["antarctica_pole", "South Pole", 915, 835],
      ["antarctica_east", "East Antarctica", 1085, 840],
      ["antarctica_ross", "Ross Ice Shelf", 1275, 823]
    ]
  },
  {
    id: "west_us",
    name: "West US",
    value: 5,
    color: "#4d9944",
    territories: [
      ["west_us_pacific_nw", "Pacific Northwest", 245, 252],
      ["west_us_california", "California", 250, 318],
      ["west_us_rockies", "Rockies", 330, 258],
      ["west_us_great_basin", "Great Basin", 380, 315],
      ["west_us_texas", "Texas", 410, 375]
    ]
  },
  {
    id: "east_us",
    name: "East US",
    value: 5,
    color: "#b89725",
    territories: [
      ["east_us_great_lakes", "Great Lakes", 480, 250],
      ["east_us_northeast", "Northeast", 560, 250],
      ["east_us_midwest", "Midwest", 475, 320],
      ["east_us_southeast", "Southeast", 535, 340],
      ["east_us_florida", "Florida", 590, 385]
    ]
  },
  {
    id: "australia",
    name: "Australia",
    value: 5,
    color: "#4858ae",
    territories: [
      ["australia_west", "Western Australia", 1270, 635],
      ["australia_north", "Northern Australia", 1370, 628],
      ["australia_east", "Eastern Australia", 1440, 665],
      ["australia_south", "Southern Australia", 1350, 720],
      ["australia_tasmania", "Tasmania", 1440, 777]
    ]
  },
  {
    id: "south_africa",
    name: "South Africa",
    value: 3,
    color: "#c53a34",
    territories: [
      ["south_africa_namibia", "Namibia", 875, 610],
      ["south_africa_botswana", "Botswana", 940, 640],
      ["south_africa_cape", "Cape", 910, 725],
      ["south_africa_madagascar", "Madagascar", 1020, 655]
    ]
  },
  {
    id: "west_africa",
    name: "West Africa",
    value: 4,
    color: "#b99826",
    territories: [
      ["west_africa_morocco", "Morocco", 760, 375],
      ["west_africa_sahara", "Sahara", 820, 395],
      ["west_africa_mali", "Mali", 830, 475],
      ["west_africa_ivory_coast", "Ivory Coast", 820, 548]
    ]
  },
  {
    id: "east_africa",
    name: "East Africa",
    value: 4,
    color: "#4b9647",
    territories: [
      ["east_africa_sudan", "Sudan", 960, 450],
      ["east_africa_ethiopia", "Ethiopia", 1005, 505],
      ["east_africa_kenya", "Kenya", 990, 565],
      ["east_africa_tanzania", "Tanzania", 950, 595],
      ["east_africa_congo", "Congo", 900, 545]
    ]
  },
  {
    id: "north_africa",
    name: "North Africa",
    value: 3,
    color: "#b79b26",
    territories: [
      ["north_africa_algeria", "Algeria", 850, 360],
      ["north_africa_libya", "Libya", 925, 380],
      ["north_africa_egypt", "Egypt", 1000, 385],
      ["north_africa_chad", "Chad", 900, 450]
    ]
  },
  {
    id: "europe",
    name: "Europe",
    value: 5,
    color: "#4c9346",
    territories: [
      ["europe_spain", "Spain", 805, 250],
      ["europe_france", "France", 855, 225],
      ["europe_germany", "Germany", 910, 205],
      ["europe_italy", "Italy", 910, 290],
      ["europe_balkans", "Balkans", 970, 280]
    ]
  },
  {
    id: "scandinavia",
    name: "Scandinavian Peninsula",
    value: 3,
    color: "#4858ae",
    territories: [
      ["scandinavia_norway", "Norway", 900, 90],
      ["scandinavia_sweden", "Sweden", 940, 118],
      ["scandinavia_finland", "Finland", 990, 110],
      ["scandinavia_denmark", "Denmark", 900, 165]
    ]
  },
  {
    id: "west_russia",
    name: "West Russia",
    value: 4,
    color: "#b59625",
    territories: [
      ["west_russia_baltic", "Baltic States", 1010, 160],
      ["west_russia_belarus", "Belarus", 1065, 190],
      ["west_russia_ukraine", "Ukraine", 1065, 255],
      ["west_russia_moscow", "Moscow", 1130, 180]
    ]
  },
  {
    id: "central_russia",
    name: "Central Russia",
    value: 4,
    color: "#ca3837",
    territories: [
      ["central_russia_urals", "Urals", 1160, 120],
      ["central_russia_kazakhstan", "Kazakhstan", 1190, 250],
      ["central_russia_west_siberia", "West Siberia", 1245, 130],
      ["central_russia_siberia", "Central Siberia", 1325, 145]
    ]
  },
  {
    id: "caucasus",
    name: "Caucasus",
    value: 5,
    color: "#5063bf",
    territories: [
      ["caucasus_black_sea", "Black Sea Coast", 1030, 305],
      ["caucasus_caucasus", "Caucasus", 1080, 330],
      ["caucasus_iran_north", "North Iran", 1120, 380],
      ["caucasus_armenia", "Armenia", 1060, 375],
      ["caucasus_caspian", "Caspian", 1160, 325]
    ]
  },
  {
    id: "middle_east",
    name: "Middle East",
    value: 4,
    color: "#c93b34",
    territories: [
      ["middle_east_turkey", "Turkey", 990, 335],
      ["middle_east_levant", "Levant", 1028, 410],
      ["middle_east_iraq", "Iraq", 1080, 420],
      ["middle_east_arabia", "Arabia", 1065, 505],
      ["middle_east_persia", "Persia", 1145, 455]
    ]
  },
  {
    id: "west_china",
    name: "West China",
    value: 6,
    color: "#5a9c4d",
    territories: [
      ["west_china_tibet", "Tibet", 1240, 365],
      ["west_china_xinjiang", "Xinjiang", 1250, 275],
      ["west_china_qinghai", "Qinghai", 1320, 330],
      ["west_china_sichuan", "Sichuan", 1348, 410],
      ["west_china_yunnan", "Yunnan", 1320, 480],
      ["west_china_mongolia", "Mongolia", 1370, 245]
    ]
  },
  {
    id: "east_russia",
    name: "East Russia",
    value: 5,
    color: "#4556ae",
    territories: [
      ["east_russia_yakutsk", "Yakutsk", 1390, 120],
      ["east_russia_chukotka", "Chukotka", 1500, 140],
      ["east_russia_kamchatka", "Kamchatka", 1500, 235],
      ["east_russia_far_east", "Far East", 1415, 210],
      ["east_russia_amur", "Amur", 1378, 185]
    ]
  },
  {
    id: "east_china",
    name: "East China",
    value: 4,
    color: "#c73b35",
    territories: [
      ["east_china_manchuria", "Manchuria", 1400, 300],
      ["east_china_beijing", "Beijing", 1370, 352],
      ["east_china_shanghai", "Shanghai", 1418, 392],
      ["east_china_guangzhou", "Guangzhou", 1395, 460],
      ["east_china_taiwan", "Taiwan", 1465, 430]
    ]
  },
  {
    id: "indonesia",
    name: "Indonesia",
    value: 4,
    color: "#4e9847",
    territories: [
      ["indonesia_sumatra", "Sumatra", 1305, 555],
      ["indonesia_java", "Java", 1375, 590],
      ["indonesia_borneo", "Borneo", 1410, 535],
      ["indonesia_new_guinea", "New Guinea", 1510, 555]
    ]
  },
  {
    id: "southeast_asia",
    name: "Southeast Asia",
    value: 3,
    color: "#8b2a97",
    territories: [
      ["southeast_asia_india", "India", 1200, 470],
      ["southeast_asia_bangladesh", "Bangladesh", 1275, 455],
      ["southeast_asia_indochina", "Indochina", 1345, 505],
      ["southeast_asia_malaysia", "Malaysia", 1365, 555]
    ]
  }
];

const ZERO_TERRITORIES = [
  ["zero_alaska", "Alaska", 115, 205],
  ["zero_hawaii", "Hawaii", 90, 385],
  ["zero_japan", "Japan", 1510, 320],
  ["zero_korea", "Korea", 1455, 330],
  ["zero_new_zealand", "New Zealand", 1535, 730],
  ["zero_sri_lanka", "Sri Lanka", 1225, 560]
];

const EXTRA_EDGES = [
  ["zero_alaska", "canada_bc"],
  ["zero_alaska", "zero_hawaii"],
  ["zero_hawaii", "west_us_california"],
  ["canada_bc", "west_us_pacific_nw"],
  ["canada_alberta", "west_us_rockies"],
  ["canada_saskatchewan", "west_us_rockies"],
  ["canada_ontario", "east_us_great_lakes"],
  ["canada_quebec", "east_us_northeast"],
  ["canada_labrador", "greenland_west"],
  ["west_us_pacific_nw", "east_us_great_lakes"],
  ["west_us_texas", "east_us_midwest"],
  ["west_us_texas", "east_us_southeast"],
  ["west_us_california", "central_america_mexico"],
  ["east_us_florida", "central_america_cuba"],
  ["central_america_panama", "south_america_colombia"],
  ["central_america_caribbean", "south_america_venezuela"],
  ["south_america_argentina", "antarctica_west"],
  ["greenland_iceland", "scandinavia_norway"],
  ["greenland_east", "scandinavia_norway"],
  ["scandinavia_denmark", "europe_germany"],
  ["scandinavia_finland", "west_russia_baltic"],
  ["europe_france", "west_russia_belarus"],
  ["europe_balkans", "west_russia_ukraine"],
  ["europe_spain", "west_africa_morocco"],
  ["europe_italy", "north_africa_libya"],
  ["europe_balkans", "middle_east_turkey"],
  ["west_russia_moscow", "central_russia_urals"],
  ["west_russia_ukraine", "caucasus_black_sea"],
  ["west_russia_ukraine", "middle_east_turkey"],
  ["central_russia_kazakhstan", "caucasus_caspian"],
  ["central_russia_kazakhstan", "west_china_xinjiang"],
  ["central_russia_siberia", "east_russia_amur"],
  ["east_russia_far_east", "east_china_manchuria"],
  ["east_russia_kamchatka", "zero_japan"],
  ["east_russia_chukotka", "zero_alaska"],
  ["zero_japan", "zero_korea"],
  ["zero_japan", "east_china_taiwan"],
  ["zero_korea", "east_china_manchuria"],
  ["zero_korea", "east_china_beijing"],
  ["west_africa_sahara", "north_africa_algeria"],
  ["west_africa_mali", "north_africa_chad"],
  ["west_africa_ivory_coast", "east_africa_congo"],
  ["north_africa_chad", "east_africa_sudan"],
  ["north_africa_egypt", "middle_east_levant"],
  ["north_africa_egypt", "east_africa_sudan"],
  ["east_africa_ethiopia", "middle_east_arabia"],
  ["east_africa_tanzania", "south_africa_botswana"],
  ["east_africa_congo", "south_africa_namibia"],
  ["south_africa_madagascar", "east_africa_tanzania"],
  ["south_africa_cape", "antarctica_pole"],
  ["caucasus_iran_north", "middle_east_persia"],
  ["caucasus_caspian", "west_china_tibet"],
  ["middle_east_persia", "southeast_asia_india"],
  ["middle_east_persia", "west_china_tibet"],
  ["west_china_yunnan", "southeast_asia_indochina"],
  ["west_china_sichuan", "east_china_guangzhou"],
  ["west_china_qinghai", "east_china_beijing"],
  ["west_china_mongolia", "east_russia_amur"],
  ["west_china_mongolia", "east_china_manchuria"],
  ["east_china_guangzhou", "southeast_asia_indochina"],
  ["east_china_taiwan", "indonesia_borneo"],
  ["southeast_asia_malaysia", "indonesia_sumatra"],
  ["southeast_asia_malaysia", "indonesia_borneo"],
  ["southeast_asia_india", "zero_sri_lanka"],
  ["indonesia_new_guinea", "australia_north"],
  ["indonesia_java", "australia_west"],
  ["australia_east", "zero_new_zealand"],
  ["australia_tasmania", "zero_new_zealand"],
  ["australia_tasmania", "antarctica_ross"],
  ["antarctica_central", "south_africa_cape"],
  ["antarctica_ross", "zero_new_zealand"]
];

export const MEDIUM_EARTH_MAP = buildMap();

function buildMap() {
  const bonuses = BONUS_SPECS.map((bonus) => ({
    id: bonus.id,
    name: bonus.name,
    value: bonus.value,
    color: bonus.color,
    territories: bonus.territories.map(([id]) => id)
  }));

  const territories = [];
  for (const bonus of BONUS_SPECS) {
    for (const [id, name, x, y] of bonus.territories) {
      territories.push({
        id,
        name,
        bonusId: bonus.id,
        bonusName: bonus.name,
        bonusValue: bonus.value,
        x,
        y,
        color: bonus.color,
        zeroBonus: false
      });
    }
  }
  for (const [id, name, x, y] of ZERO_TERRITORIES) {
    territories.push({
      id,
      name,
      bonusId: "zero",
      bonusName: "Zero-value territories",
      bonusValue: 0,
      x,
      y,
      color: "#b5b5b5",
      zeroBonus: true
    });
  }

  const edges = new Set();
  for (const bonus of BONUS_SPECS) {
    for (let i = 0; i < bonus.territories.length - 1; i += 1) {
      addEdge(edges, bonus.territories[i][0], bonus.territories[i + 1][0]);
    }
    if (bonus.territories.length >= 4) {
      addEdge(edges, bonus.territories[0][0], bonus.territories[2][0]);
      addEdge(edges, bonus.territories[1][0], bonus.territories[3][0]);
    }
  }
  for (const [a, b] of EXTRA_EDGES) addEdge(edges, a, b);

  const adjacency = Object.fromEntries(territories.map((territory) => [territory.id, []]));
  for (const edge of edges) {
    const [a, b] = edge.split("|");
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  for (const list of Object.values(adjacency)) list.sort();

  return Object.freeze({
    id: "medium-earth-traditional",
    name: "Medium Earth Traditional",
    viewBox: { width: 1600, height: 900 },
    imageAspect: 1536 / 900,
    bonuses,
    territories,
    adjacency,
    edges: [...edges].map((edge) => edge.split("|")),
    distributionBonusIds: bonuses.filter((bonus) => bonus.value > 0).map((bonus) => bonus.id)
  });
}

function addEdge(edges, a, b) {
  if (a === b) return;
  edges.add([a, b].sort().join("|"));
}

export function getTerritory(map, id) {
  return map.territories.find((territory) => territory.id === id);
}

export function getBonus(map, id) {
  return map.bonuses.find((bonus) => bonus.id === id);
}

export function assertMapIntegrity(map = MEDIUM_EARTH_MAP) {
  const territoryIds = new Set(map.territories.map((territory) => territory.id));
  const errors = [];
  for (const territory of map.territories) {
    if (!Array.isArray(map.adjacency[territory.id])) {
      errors.push(`Missing adjacency for ${territory.id}`);
    }
  }
  for (const [a, neighbors] of Object.entries(map.adjacency)) {
    if (!territoryIds.has(a)) errors.push(`Unknown territory in adjacency: ${a}`);
    for (const b of neighbors) {
      if (!territoryIds.has(b)) errors.push(`Unknown neighbor ${b} from ${a}`);
      if (!map.adjacency[b]?.includes(a)) errors.push(`Adjacency is not symmetric: ${a} -> ${b}`);
    }
  }
  for (const bonus of map.bonuses) {
    for (const territoryId of bonus.territories) {
      if (!territoryIds.has(territoryId)) errors.push(`Bonus ${bonus.id} references missing territory ${territoryId}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}
