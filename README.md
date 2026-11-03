# Jellyfin Library Card

A Home Assistant Lovelace card for the [JellyHA](https://github.com/zupancicmarko/JellyHA) integration.

![Preview](preview.png)

*Preview uses sample data and stand-in artwork.*

## Features
- Big animated film count
- Up to four configurable boxes: series, episodes, songs, albums, artists, videos, active clients or any sensor
- Jellyfin version badge
- **Now watching**: every client currently playing (or paused), with poster, user, device, progress bar and live elapsed / remaining time. Hidden when nobody is watching
- **Latest added** film with backdrop art and poster
- Tap any box to open the sensor pop-up, or set your own action
- Full visual editor, no YAML needed

## Install
1. Copy `jellyfin-library-card.js` to `/config/www/`
2. Settings > Dashboards > Resources > add `/local/jellyfin-library-card.js` as a *JavaScript module*
3. Add the card: `type: custom:jellyfin-library-card`

All entities default to JellyHA's names, so no config is needed.

## Options
| Option | Default | Description |
|---|---|---|
| `entity` | `sensor.jellyha_movies` | Film count |
| `clients_entity` | `sensor.jellyha_connected_clients` | Active clients |
| `storage_entity` | `sensor.jellyha_media_storage_free` | Used by the `disk_used` / `disk_free` boxes |
| `library_entity` | `sensor.jellyha_library` | Fallback: uses its movies/series/episodes attributes if a count sensor is missing |
| `latest_entity` | `sensor.jellyha_latest_movie` | Latest film |
| `version_entity` | `sensor.jellyha_jellyfin_version` | Jellyfin version |
| `title` / `subtitle` | `Film Collection` / `Jellyfin` | Header text |
| `show_extras` | `true` | Show the boxes |
| `boxes` | series, episodes, clients | List of up to 4 boxes. `[]` hides the row. See below |
| `show_latest` | `true` | Latest added section |
| `show_now_playing` | `true` | Now watching list |
| `show_paused` | `true` | Include paused sessions |
| `players` | all `media_player.jellyha_*` | Limit Now watching to these players |
| `film_tap_action`, `latest_tap_action` | `more-info` | Tap actions for the film count and latest added |

## Boxes
Add, remove and reorder up to four boxes under the film count in the visual editor, or in YAML:

```yaml
type: custom:jellyfin-library-card
boxes:
  - type: series        # series | episodes | songs | albums | artists | videos | movies | clients
                        # | disk_used | disk_free | library_size | custom
  - type: episodes
  - type: songs
  - type: custom        # any numeric sensor
    name: Playlists     # optional label
    entity: sensor.my_playlists
    attribute: count    # optional: read an attribute instead of the state
    tap_action:         # optional
      action: none
```
`disk_used` and `disk_free` read the storage sensor; `library_size` adds up every `sensor.jellyha_library_*_storage_size`. A box opens its own sensor when tapped.

With no `boxes`, you get series, episodes and active clients. `boxes: []` hides the row. The older `box1_type` ... `box4_type` settings still work.
