# Meraki

`champions.json` and `items.json` for the Nexus mini-games, regenerated every week from sources that follow the game.

Same shape as `cdn.merakianalytics.com/riot/lol/resources/latest/en-US/{champions,items}.json`, restricted to the fields Nexus reads:

- `champions.json`: `id`, `key`, `name`, `releaseDate`, `faction`, `positions`, `roles`, `resource`, `attackType`, `adaptiveType`, `stats.{health,attackDamage,armor,magicResistance,movespeed,attackRange}.flat`.
- `items.json`: `id`, `name`, `rank`, `removed`, `requiredChampion`, `shop.purchasable`.

## Sources

| Data | Source |
| --- | --- |
| Release date, positions, roles, resource, attack and adaptive type, item types | [League of Legends Wiki](https://wiki.leagueoflegends.com) `Module:ChampionData` and `Module:ItemData` (text under CC BY-SA) |
| Base stats | Data Dragon (`ddragon.leagueoflegends.com`), latest version |
| Faction | Universe champion list (`universe-meeps.leagueoflegends.com`) |
| Champions and items in the game, items on sale | [Community Dragon](https://www.communitydragon.org) |

A champion of the game that the wiki, Data Dragon or the Universe list does not have yet fails the run: the last files stay, nothing partial is published.

## Use

```
node generate.js
```

Node 24, no dependency. The `Update` workflow runs it weekly (Monday) and commits the files when they change. Read them from `https://raw.githubusercontent.com/<owner>/Meraki/main/champions.json` (public repository).
