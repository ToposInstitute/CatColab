import { Attr, AttrType, Entity, Mapping } from "catcolab-logics/simple-schema";

import type { TableRow } from "catcolab-documents";
import type { DemoDocument } from "./document";

export const EXAMPLE_QUERY = `;; Query for planet-star "Orbit" relations where one planet orbits multiple stars.

[:find ?planet-name ?star-name
 :where
 [?planet "Planet/name" ?planet-name]
 [?orbit "Orbit/planet" ?planet]
 [?orbit "Orbit/star" ?star]
 [?star "Star/name" ?star-name]
 ;; Require another orbit from the same planet to a distinct star.
 ;; This keeps only planets with multiple suns while returning each sun.
 [?other-orbit "Orbit/planet" ?planet]
 [?other-orbit "Orbit/star" ?other-star]
 [(!= ?star ?other-star)]]`;

type PlanetData = {
    name: string;
    id: string;
    temperature: number;
    distanceFromEarth: number;
    distanceFromSun: number;
    orbitTime: number;
    radius: number;
    mass: number;
    blurb: string;
};

const planets: PlanetData[] = [
    {
        name: "Mercury",
        id: "mercury",
        temperature: 350,
        distanceFromEarth: 0.0000097,
        distanceFromSun: 0.0000061307,
        orbitTime: 88,
        radius: 0.383,
        mass: 0.055,
        blurb: "The first planet from our Sun and the smallest in our solar system, Mercury has no atmosphere.",
    },
    {
        name: "Venus",
        id: "venus",
        temperature: 480,
        distanceFromEarth: 0.0000044,
        distanceFromSun: 0.0000114307,
        orbitTime: 224.7,
        radius: 0.949,
        mass: 0.815,
        blurb: "Venus has a dense atmosphere composed of super critical carbon dioxide and sulfuric acid.",
    },
    {
        name: "Earth",
        id: "earth",
        temperature: 14.9,
        distanceFromEarth: 0,
        distanceFromSun: 0.00001581,
        orbitTime: 365.3,
        radius: 1,
        mass: 1,
        blurb: "Home sweet home.",
    },
    {
        name: "Mars",
        id: "mars",
        temperature: -23,
        distanceFromEarth: 0.0000083,
        distanceFromSun: 0.00001581 + 0.0000083,
        orbitTime: 688,
        radius: 0.532,
        mass: 0.107,
        blurb: "The second smallest planet in our solar system, Mars is red because it is covered in iron oxide dust.",
    },
    {
        name: "Jupiter",
        id: "jupiter",
        temperature: -150,
        distanceFromEarth: 0.0000666,
        distanceFromSun: 0.00001581 + 0.0000666,
        orbitTime: 4332.8,
        radius: 11.209,
        mass: 317.8,
        blurb: "The largest planet in our solar system is a gas giant composed of hydrogen, helium, methane and ammonia.",
    },
    {
        name: "Saturn",
        id: "saturn",
        temperature: -210,
        distanceFromEarth: 0.0001344,
        distanceFromSun: 0.00001581 + 0.0001344,
        orbitTime: 10755.7,
        radius: 9.449,
        mass: 95.2,
        blurb: "Almost as big as Jupiter, the gas giant Saturn only has a third of the mass. Saturn also has a distinctive ring system.",
    },
    {
        name: "Uranus",
        id: "uranus",
        temperature: -210,
        distanceFromEarth: 0.0002888,
        distanceFromSun: 0.00001581 + 0.0002888,
        orbitTime: 30687.1,
        radius: 4.007,
        mass: 14.5,
        blurb: "Uranus is a cyan colored ice giant made of water, ammonia and methane in a supercritical phase.",
    },
    {
        name: "Neptune",
        id: "neptune",
        temperature: -220,
        distanceFromEarth: 0.0004593,
        distanceFromSun: 0.00001581 + 0.0004593,
        orbitTime: 60190,
        radius: 3.883,
        mass: 17.1,
        blurb: "The farthest planet from the Sun in our solar system is an ice giant primarily composed of gases and liquids.",
    },
    {
        name: "Proxima Centauri b",
        id: "proxima-centauri-b",
        temperature: -39,
        distanceFromEarth: 4.24,
        distanceFromSun: 0.00001581 + 4.24,
        orbitTime: 11.2,
        radius: 0.94,
        mass: 1.07,
        blurb: "Proxima Centauri b is the closest exoplanet and is theorized to be rocky.",
    },
    {
        name: "Kepler 22 b",
        id: "kepler-22-b",
        temperature: 6,
        distanceFromEarth: 600,
        distanceFromSun: 0.00001581 + 600,
        orbitTime: 289.9,
        radius: 2.135,
        mass: 9.1,
        blurb: "A possible water world covered entirely in ocean.",
    },
    {
        name: "TrES 2 b",
        id: "tres-2-b",
        temperature: 1612,
        distanceFromEarth: 703,
        distanceFromSun: 0.00001581 + 703,
        orbitTime: 2.5,
        radius: 13.51,
        mass: 381,
        blurb: "It's always night on TrES 2 b: the darkest planet ever discovered orbiting a star. It has a reflectivity lower than coal.",
    },
    {
        name: "HD 189733 b",
        id: "hd-189733-b",
        temperature: 919,
        distanceFromEarth: 65,
        distanceFromSun: 0.00001581 + 65,
        orbitTime: 2.2,
        radius: 12.5156,
        mass: 357,
        blurb: "While it may look serene, this planet gets its cobalt blue color from a hazy scorching atmosphere with clouds that rain glass!",
    },
    {
        name: "Gliese 12 b",
        id: "gliese-12-b",
        temperature: 42,
        distanceFromEarth: 40,
        distanceFromSun: 0.00001581 + 40,
        orbitTime: 12.8,
        radius: 0.958,
        mass: 3.87,
        blurb: "Gliese 12 b orbits a red dwarf star and is one of the nearest known relatively temperate transiting exoplanets.",
    },
    {
        name: "Teegarden's Star b",
        id: "teegardens-star-b",
        temperature: 3.85,
        distanceFromEarth: 13,
        distanceFromSun: 0.00001581 + 13,
        orbitTime: 4.9,
        radius: 1.05,
        mass: 1.16,
        blurb: "Though we don't actually know very much about it Teegarden b is considered to be potentially one of the most Earth-like of the known exoplanets.",
    },
    {
        name: "KELT 9 b",
        id: "kelt-9-b",
        temperature: 3776,
        distanceFromEarth: 667,
        distanceFromSun: 0.00001581 + 667,
        orbitTime: 1.5,
        radius: 20.797,
        mass: 916,
        blurb: "KELT 9 b is so extremely hot that on the day side molecules are torn apart from the heat.",
    },
    {
        name: "TOI 3757 b",
        id: "toi-3757-b",
        temperature: 486,
        distanceFromEarth: 591,
        distanceFromSun: 0.00001581 + 591,
        orbitTime: 3.4,
        radius: 12,
        mass: 85,
        blurb: "This gas giant has the density of a marshmallow.",
    },
    {
        name: "Kepler 16 b",
        id: "kepler-16-b",
        temperature: -20,
        distanceFromEarth: 245,
        distanceFromSun: 0.00001581 + 245,
        orbitTime: 228.8,
        radius: 8.2646,
        mass: 105.87,
        blurb: "Kepler 16 b is a planet orbiting two stars, a rare occurrence!",
    },
    {
        name: "TOI 700 d",
        id: "toi-700-d",
        temperature: -4.3,
        distanceFromEarth: 102,
        distanceFromSun: 0.00001581 + 102,
        orbitTime: 37.4,
        radius: 1.073,
        mass: 1.25,
        blurb: "A potentially rocky world, larger than Earth, orbiting a red dwarf star.",
    },
    {
        name: "55 Cancri e",
        id: "55-cancri-e",
        temperature: 3498,
        distanceFromEarth: 41,
        distanceFromSun: 0.00001581 + 41,
        orbitTime: 0.74,
        radius: 1.875,
        mass: 7.99,
        blurb: "Also known as Janssen, this super-Earth is likely covered in lava and extremely hot since it orbits so close to its parent star.",
    },
    {
        name: "HR 5183 b",
        id: "hr-5183-b",
        temperature: -102,
        distanceFromEarth: 103,
        distanceFromSun: 0.00001581 + 103,
        orbitTime: 102 * 365.25,
        radius: 10.1759,
        mass: 1026.9,
        blurb: 'Known as the "wrecking ball planet", HR 5183 b has an extremely eccentric orbit that takes it from closer than Jupiter to beyond Neptune.',
    },
    {
        name: "K2 18 b",
        id: "k2-18-b",
        temperature: -8,
        distanceFromEarth: 124,
        distanceFromSun: 0.00001581 + 124,
        orbitTime: 32.9,
        radius: 2.37,
        mass: 8.92,
        blurb: "Water was discovered on K2 18 b in 2019 but it's likely superheated and super-compressed. Not so great for a swim!",
    },
    {
        name: "Kepler 452 b",
        id: "kepler-452-b",
        temperature: -8,
        distanceFromEarth: 1400,
        distanceFromSun: 0.00001581 + 1400,
        orbitTime: 384.843,
        radius: 1.5,
        mass: 5,
        blurb: "Kepler 452 b orbits a very Sun-like star at almost the same distance as Earth does from our Sun. It's 60% larger than Earth and could be rocky.",
    },
    {
        name: "Gliese 504 b",
        id: "gliese-504-b",
        temperature: 271,
        distanceFromEarth: 57,
        distanceFromSun: 0.00001581 + 57,
        orbitTime: 1332 * 365,
        radius: 10.52,
        mass: 1271,
        blurb: "This newly formed planet is still glowing with a beautiful magenta color. It orbits it star at nearly nine times the distance that Jupiter orbits our Sun.",
    },
    {
        name: "Kepler 10 c",
        id: "kepler-10-c",
        temperature: 311,
        distanceFromEarth: 605,
        distanceFromSun: 0.00001581 + 605,
        orbitTime: 45.3,
        radius: 2.355,
        mass: 11.4,
        blurb: 'This "mega-Earth" is such a massive rocky planet that its existence challenges current planet formation theories.',
    },
    {
        name: "Gliese 436 b",
        id: "gliese-436-b",
        temperature: 439,
        distanceFromEarth: 32,
        distanceFromSun: 0.00001581 + 32,
        orbitTime: 2.643904,
        radius: 4.327,
        mass: 21.36,
        blurb: "While its surface temperature is much higher than the boiling point, the gravity on this planet is so powerful that it compresses water into solid ice.",
    },
    {
        name: "HAT P 7 b",
        id: "hat-p-7-b",
        temperature: 2457,
        distanceFromEarth: 1000,
        distanceFromSun: 0.00001581 + 1000,
        orbitTime: 2.2,
        radius: 16.4,
        mass: 574.5,
        blurb: "Aluminium oxide is found in this gas giant's atmosphere which makes it likely that it rains rubies and sapphires in its frequent violent storms!",
    },
    {
        name: "PSR J1719 1438 b",
        id: "psr-j1719-1438-b",
        temperature: 1000,
        distanceFromEarth: 4000,
        distanceFromSun: 0.00001581 + 4000,
        orbitTime: 0.090706293,
        radius: 4,
        mass: 330,
        blurb: "This planet orbits an extremely compact and dense star that is only about the size of a large city. It fully orbits this pulsar star in just over two hours!",
    },
    {
        name: "OGLE 2005 BLG 390L b",
        id: "ogle-2005-blg-390l-b",
        temperature: -220,
        distanceFromEarth: 22000,
        distanceFromSun: 0.00001581 + 22000,
        orbitTime: 9 * 365.25,
        radius: 2.21,
        mass: 5.5,
        blurb: "Orbiting a faint red dwarf star, it gets so little light from it, that this distant frozen world is one of the coldest known planets in the Universe.",
    },
    {
        name: "PSR B1620 26 b",
        id: "psr-b1620-26-b",
        temperature: -201.2,
        distanceFromEarth: 5871,
        distanceFromSun: 0.00001581 + 5871,
        orbitTime: 24837,
        radius: 12.934,
        mass: 795,
        blurb: "Not only does it orbit two stars, this is the oldest known planet at about 13 billion years old. It formed only 1 billion years after the birth of the Universe.",
    },
    {
        name: "2MASS J2126-8140",
        id: "2mass-j2126-8140",
        temperature: 1390,
        distanceFromEarth: 111.4,
        distanceFromSun: 0.00001581 + 111.4,
        orbitTime: 328725000,
        radius: 152,
        mass: 4228,
        blurb: "This planet has the widest known orbit, at a staggering distance of around 1 trillion kilometers, it takes nearly a million years to complete one orbit.",
    },
];

const spectralClasses = [
    ["G", "G-type", "Yellow main-sequence or Sun-like star"],
    ["K", "K-type", "Orange main-sequence star"],
    ["M", "M-type", "Red dwarf star"],
    ["A", "A-type", "Hot white star; KELT-9 is near the late-B/early-A boundary"],
    ["F", "F-type", "Yellow-white main-sequence star"],
    ["Pulsar", "Pulsar", "Rapidly rotating neutron star"],
    ["WhiteDwarf", "White dwarf", "Compact stellar remnant"],
] as const;

const stars = [
    ["sun", "Sun", "G"],
    ["proxima", "Proxima Centauri", "M"],
    ["kepler22", "Kepler-22", "G"],
    ["kepler1", "Kepler-1 (GSC 03549-02811)", "G"],
    ["hd189733", "HD 189733", "K"],
    ["gliese12", "Gliese 12", "M"],
    ["teegarden", "Teegarden's Star", "M"],
    ["kelt9", "KELT-9 (HD 195689)", "A"],
    ["toi3757", "TOI-3757", "M"],
    ["kepler16a", "Kepler-16 A", "K"],
    ["kepler16b", "Kepler-16 B", "M"],
    ["toi700", "TOI-700", "M"],
    ["55cancri", "55 Cancri A", "K"],
    ["hr5183", "HR 5183", "G"],
    ["k218", "K2-18", "M"],
    ["kepler452", "Kepler-452", "G"],
    ["gliese504", "Gliese 504", "G"],
    ["kepler10", "Kepler-10", "G"],
    ["gliese436", "Gliese 436", "M"],
    ["hatp7", "HAT-P-7", "F"],
    ["psrj1719", "PSR J1719-1438", "Pulsar"],
    ["ogle", "OGLE-2005-BLG-390L", "M"],
    ["psrb1620a", "PSR B1620-26 A", "Pulsar"],
    ["psrb1620b", "PSR B1620-26 B", "WhiteDwarf"],
    ["tyc9486", "TYC 9486-927-1", "K"],
] as const;

const hosts: Record<string, readonly string[]> = {
    mercury: ["sun"],
    venus: ["sun"],
    earth: ["sun"],
    mars: ["sun"],
    jupiter: ["sun"],
    saturn: ["sun"],
    uranus: ["sun"],
    neptune: ["sun"],
    "proxima-centauri-b": ["proxima"],
    "kepler-22-b": ["kepler22"],
    "tres-2-b": ["kepler1"],
    "hd-189733-b": ["hd189733"],
    "gliese-12-b": ["gliese12"],
    "teegardens-star-b": ["teegarden"],
    "kelt-9-b": ["kelt9"],
    "toi-3757-b": ["toi3757"],
    "kepler-16-b": ["kepler16a", "kepler16b"],
    "toi-700-d": ["toi700"],
    "55-cancri-e": ["55cancri"],
    "hr-5183-b": ["hr5183"],
    "k2-18-b": ["k218"],
    "kepler-452-b": ["kepler452"],
    "gliese-504-b": ["gliese504"],
    "kepler-10-c": ["kepler10"],
    "gliese-436-b": ["gliese436"],
    "hat-p-7-b": ["hatp7"],
    "psr-j1719-1438-b": ["psrj1719"],
    "ogle-2005-blg-390l-b": ["ogle"],
    "psr-b1620-26-b": ["psrb1620a", "psrb1620b"],
    "2mass-j2126-8140": ["tyc9486"],
};

const moons = [
    ["Moon", 1737.4, "earth"],
    ["Phobos", 11.267, "mars"],
    ["Deimos", 6.2, "mars"],
    ["Io", 1821.6, "jupiter"],
    ["Europa", 1560.8, "jupiter"],
    ["Ganymede", 2634.1, "jupiter"],
    ["Callisto", 2410.3, "jupiter"],
    ["Mimas", 198.2, "saturn"],
    ["Enceladus", 252.1, "saturn"],
    ["Tethys", 531.1, "saturn"],
    ["Dione", 561.4, "saturn"],
    ["Rhea", 763.8, "saturn"],
    ["Titan", 2574.73, "saturn"],
    ["Iapetus", 734.5, "saturn"],
    ["Miranda", 235.8, "uranus"],
    ["Ariel", 578.9, "uranus"],
    ["Umbriel", 584.7, "uranus"],
    ["Titania", 788.9, "uranus"],
    ["Oberon", 761.4, "uranus"],
    ["Proteus", 210, "neptune"],
    ["Triton", 1353.4, "neptune"],
] as const;

function requiredRow(rows: ReadonlyMap<string, TableRow>, key: string): TableRow {
    const row = rows.get(key);
    if (!row) {
        throw new Error(`Example data references missing row "${key}".`);
    }
    return row;
}

/** Replace the current demo document with the planets relational example. */
export async function loadExampleData(
    doc: Pick<
        DemoDocument,
        "schema" | "tables" | "refreshTables" | "addRow" | "setRowValue" | "attrTypes"
    >,
) {
    const { schema, tables, refreshTables, addRow, setRowValue, attrTypes } = doc;

    for (const table of tables()) {
        for (const row of table.rows) {
            row.delete();
        }
    }
    const attrTypeIds = new Set(schema.cellsOf(AttrType).map((cell) => cell.id));
    for (const cell of schema.cells()) {
        if (!attrTypeIds.has(cell.id)) {
            cell.delete();
        }
    }

    const planet = schema.add(Entity, { label: "Planet" });
    const planetName = schema.add(Attr, { label: "name", from: planet, to: attrTypes.String });
    const planetId = schema.add(Attr, { label: "id", from: planet, to: attrTypes.String });
    const temperature = schema.add(Attr, {
        label: "temperature",
        from: planet,
        to: attrTypes.Float,
    });
    const distanceFromEarth = schema.add(Attr, {
        label: "distance-from-earth",
        from: planet,
        to: attrTypes.Float,
    });
    const distanceFromSun = schema.add(Attr, {
        label: "distance-from-sun",
        from: planet,
        to: attrTypes.Float,
    });
    const orbitTime = schema.add(Attr, {
        label: "orbit-time",
        from: planet,
        to: attrTypes.Float,
    });
    const radius = schema.add(Attr, { label: "radius", from: planet, to: attrTypes.Float });
    const mass = schema.add(Attr, { label: "mass", from: planet, to: attrTypes.Float });
    const blurb = schema.add(Attr, { label: "blurb", from: planet, to: attrTypes.String });
    await refreshTables();

    const planetRows = new Map<string, TableRow>(
        planets.map((values) => [
            values.id,
            (() => {
                const row = addRow(planet);
                setRowValue(planet, row, planetName, values.name);
                setRowValue(planet, row, planetId, values.id);
                setRowValue(planet, row, temperature, values.temperature);
                setRowValue(planet, row, distanceFromEarth, values.distanceFromEarth);
                setRowValue(planet, row, distanceFromSun, values.distanceFromSun);
                setRowValue(planet, row, orbitTime, values.orbitTime);
                setRowValue(planet, row, radius, values.radius);
                setRowValue(planet, row, mass, values.mass);
                setRowValue(planet, row, blurb, values.blurb);
                return row;
            })(),
        ]),
    );

    const spectralClass = schema.add(Entity, { label: "Spectral class" });
    const className = schema.add(Attr, {
        label: "name",
        from: spectralClass,
        to: attrTypes.String,
    });
    const classDescription = schema.add(Attr, {
        label: "description",
        from: spectralClass,
        to: attrTypes.String,
    });
    await refreshTables();
    const classRows = new Map<string, TableRow>(
        spectralClasses.map(([key, name, description]) => [
            key,
            (() => {
                const row = addRow(spectralClass);
                setRowValue(spectralClass, row, className, name);
                setRowValue(spectralClass, row, classDescription, description);
                return row;
            })(),
        ]),
    );

    const star = schema.add(Entity, { label: "Star" });
    const starName = schema.add(Attr, { label: "name", from: star, to: attrTypes.String });
    const starClass = schema.add(Mapping, {
        label: "spectral-class",
        from: star,
        to: spectralClass,
    });
    await refreshTables();
    const starRows = new Map<string, TableRow>(
        stars.map(([key, name, classKey]) => [
            key,
            (() => {
                const row = addRow(star);
                setRowValue(star, row, starName, name);
                setRowValue(star, row, starClass, requiredRow(classRows, classKey));
                return row;
            })(),
        ]),
    );

    const orbit = schema.add(Entity, { label: "Orbit" });
    const orbitPlanet = schema.add(Mapping, { label: "planet", from: orbit, to: planet });
    const orbitStar = schema.add(Mapping, { label: "star", from: orbit, to: star });
    const hostRole = schema.add(Attr, {
        label: "host-role",
        from: orbit,
        to: attrTypes.String,
    });
    await refreshTables();
    for (const [planetId, starKeys] of Object.entries(hosts)) {
        for (const [index, starKey] of starKeys.entries()) {
            const row = addRow(orbit);
            setRowValue(orbit, row, orbitPlanet, requiredRow(planetRows, planetId));
            setRowValue(orbit, row, orbitStar, requiredRow(starRows, starKey));
            setRowValue(orbit, row, hostRole, index === 0 ? "primary" : "secondary");
        }
    }

    const moon = schema.add(Entity, { label: "Moon" });
    const moonName = schema.add(Attr, { label: "name", from: moon, to: attrTypes.String });
    const moonRadius = schema.add(Attr, {
        label: "mean-radius-km",
        from: moon,
        to: attrTypes.Float,
    });
    const moonPlanet = schema.add(Mapping, { label: "orbits", from: moon, to: planet });
    await refreshTables();
    for (const [name, radius, planetId] of moons) {
        const row = addRow(moon);
        setRowValue(moon, row, moonName, name);
        setRowValue(moon, row, moonRadius, radius);
        setRowValue(moon, row, moonPlanet, requiredRow(planetRows, planetId));
    }
}
