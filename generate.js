import { writeFileSync } from "node:fs";
import { parseLua } from "./lua.js";

const WIKI = "https://wiki.leagueoflegends.com/en-us";
const UNIVERSE = "https://universe-meeps.leagueoflegends.com/v1/en_us/champion-browse/index.json";
const DDRAGON = "https://ddragon.leagueoflegends.com";
const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";

const get = async (url, kind) => {
	const res = await fetch(url, { headers: { "user-agent": "meraki-generator (+https://github.com/MaxiusDT/Meraki)" } });
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	return kind === "json" ? res.json() : parseLua(await res.text());
};
const wikiModule = (name) => get(`${WIKI}/Module:${name}/data?action=raw`, "lua");

// Names differ in punctuation between the sources (Bel'Veth, Nunu & Willump): compared on their letters and digits.
const plain = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const enumOf = (text) => text.toUpperCase().replaceAll(" ", "_");
const POSITIONS = { Top: "TOP", Jungle: "JUNGLE", Middle: "MIDDLE", Bottom: "BOTTOM", Support: "SUPPORT" };
const ADAPTIVE = { Physical: "PHYSICAL_DAMAGE", Magic: "MAGIC_DAMAGE" };
const ATTACK = { Melee: "MELEE", Ranged: "RANGED" };
const list = (value) => (typeof value === "string" ? [value] : Object.values(value ?? {})).filter(Boolean);
const lookup = (map, value, what, name) => {
	if (!(value in map)) throw new Error(`${name}: unknown ${what} "${value}"`);
	return map[value];
};

// The base stats the client shows (a champion with two forms has the one it starts with), by champion id.
async function baseStats() {
	const [version] = await get(`${DDRAGON}/api/versions.json`, "json");
	const { data } = await get(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`, "json");
	return new Map(Object.values(data).map((c) => [Number(c.key), c.stats]));
}

const STATS = { health: "hp", attackDamage: "attackdamage", armor: "armor", magicResistance: "spellblock", movespeed: "movespeed", attackRange: "attackrange" };
const statsOf = (name, stats) =>
	Object.fromEntries(
		Object.entries(STATS).map(([stat, source]) => {
			if (typeof stats?.[source] !== "number") throw new Error(`${name}: no ${stat} in Data Dragon`);
			return [stat, { flat: stats[source] }];
		}),
	);

// Same shape as Meraki's champions.json for the fields Nexus reads; the other fields are not generated.
async function champions() {
	const [wiki, universe, summary, stats] = await Promise.all([wikiModule("ChampionData"), get(UNIVERSE, "json"), get(`${CDRAGON}/champion-summary.json`, "json"), baseStats()]);
	const factions = new Map(universe.champions.map((c) => [plain(c.name), c["associated-faction-slug"]]));
	const out = {};
	for (const [name, c] of Object.entries(wiki)) {
		// A form of a champion (Mega Gnar is 150.2, Kled & Skaarl 240.1) shares its apiname: not a champion of its own.
		if (!Number.isInteger(c.id)) continue;
		const faction = factions.get(plain(name));
		if (!faction) throw new Error(`${name}: no faction in the Universe list`);
		out[c.apiname] = {
			id: c.id,
			key: c.apiname,
			name,
			releaseDate: c.date,
			faction,
			// Where the champion is played (the wiki's external lists), else where the client puts it.
			positions: (list(c.external_positions).length ? list(c.external_positions) : list(c.client_positions)).map((p) => lookup(POSITIONS, p, "position", name)),
			roles: [...new Set([c.herotype, c.alttype, ...list(c.role)].filter(Boolean).map(enumOf))].sort(),
			resource: enumOf(c.resource),
			attackType: lookup(ATTACK, c.rangetype, "attack type", name),
			adaptiveType: lookup(ADAPTIVE, c.adaptivetype, "adaptive type", name),
			stats: statsOf(name, stats.get(c.id)),
		};
	}
	// A champion of the game missing here (new, or not yet on the wiki or in the Universe list) fails the run: the last file stays.
	const known = new Set(Object.values(out).map((c) => c.id));
	const missing = summary.filter((c) => c.id > 0 && !c.alias.startsWith("Jade_") && !known.has(c.id)).map((c) => c.name);
	if (missing.length) throw new Error(`Champions missing from the sources: ${missing.join(", ")}`);
	return out;
}

// The game modes of an item, as the wiki names them. A mode the wiki adds later comes out as its own name, upper-cased.
const MODES = { "classic sr 5v5": "CLASSIC", aram: "ARAM", nb: "NEXUS_BLITZ", ar: "ARENA", mayhem: "ARAM_MAYHEM" };

// Same shape as Meraki's items.json for the fields Nexus reads: `rank` (the wiki's item types), and `removed`, `shop.purchasable`,
// `requiredChampion` (the game's own list: an item the game no longer lists is removed). Plus `modes`, the modes it is sold in.
async function items() {
	const [wiki, game] = await Promise.all([wikiModule("ItemData"), get(`${CDRAGON}/items.json`, "json")]);
	const listed = new Map(game.map((item) => [item.id, item]));
	// An item that turns into another (`=>Muramana`) takes the other's type and modes.
	const field = (item, key, depth = 0) => {
		const value = item[key];
		if (typeof value !== "string" || !value.startsWith("=>") || depth > 3) return value;
		const target = wiki[value.slice(2)];
		return target && field(target, key, depth + 1);
	};
	const out = {};
	for (const [name, item] of Object.entries(wiki)) {
		if (!Number.isInteger(item.id) || out[item.id]) continue;
		const rank = list(field(item, "type")).map(enumOf);
		if (!rank.length) continue;
		const live = listed.get(item.id);
		const modes = Object.entries(field(item, "modes") ?? {})
			.filter(([, on]) => on === true)
			.map(([mode]) => MODES[mode] ?? enumOf(mode));
		out[item.id] = { id: item.id, name, rank, modes, removed: !live, requiredChampion: live?.requiredChampion ?? "", shop: { purchasable: live?.inStore ?? false } };
	}
	return out;
}

const write = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, "\t")}\n`);
const [champs, stuff] = await Promise.all([champions(), items()]);
// Far under today's counts (175 and 330): a source that answers with a fraction of its data fails the run.
if (Object.keys(champs).length < 150 || Object.keys(stuff).length < 250) throw new Error("A source answered with too little data");
write("champions.json", champs);
write("items.json", stuff);
console.log(`${Object.keys(champs).length} champions, ${Object.keys(stuff).length} items`);
