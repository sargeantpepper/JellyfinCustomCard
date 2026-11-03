# Jellyfin Library Card

A Home Assistant Lovelace card for the [JellyHA](https://github.com/zupancicmarko/JellyHA) integration.

![Preview](preview.png)

*A real dashboard using the JellyHA integration (box 1-3 set to songs, albums and library size).*

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

## Card picker
Once the resource is loaded, the card appears in Home Assistant's **Add card** dialog under *Custom cards* as **Jellyfin Library Card**, with a live preview. If it isn't listed, hard-refresh the browser (Ctrl+Shift+R) or clear the app cache, and check the resource is added as a *JavaScript module*.

## Options
| Option | Default | Description |
|---|---|---|
| `entity` | `sensor.jellyha_movies` | Film count |
| `clients_entity` | `sensor.jellyha_connected_clients` | Active clients |
| `library_entity` | `sensor.jellyha_library` | Fallback: uses its movies/series/episodes attributes if a count sensor is missing |
| `latest_entity` | `sensor.jellyha_latest_movie` | Latest film |
| `version_entity` | `sensor.jellyha_jellyfin_version` | Jellyfin version |
| `title` / `subtitle` | `Film Collection` / `Jellyfin` | Header text |
| `show_extras` | `true` | Show the boxes |
| `boxes` | series, episodes, clients | Up to 4 boxes, each a sensor. See below |
| `show_latest` | `true` | Latest added section |
| `show_now_playing` | `true` | Now watching list |
| `show_paused` | `true` | Include paused sessions |
| `players` | all `media_player.jellyha_*` | Limit Now watching to these players |
| `film_tap_action`, `latest_tap_action` | `more-info` | Tap actions for the film count and latest added |

## Boxes
Up to four boxes under the film count, each showing any sensor. Add, remove and reorder them in the visual editor, or in YAML:

```yaml
type: custom:jellyfin-library-card
boxes:
  - entity: sensor.jellyha_series
  - entity: sensor.jellyha_connected_clients
    name: Active clients        # optional label (default: the sensor's name)
  - entity: sensor.jellyha_library
    attribute: songs            # optional: show an attribute instead of the state
  - entity: sensor.jellyha_media_storage_free
    tap_action:                 # optional, any standard HA action
      action: none
```
Units are shown, and GB/TB-style sensors step up automatically (3500 GB shows as 3.5 TB). Tapping a box opens its sensor unless you set a `tap_action`. `boxes: []` hides the row. With no `boxes`, you get series, episodes and active clients.

Boxes made with the older type picker (`type: series`, `box1_type`, ...) keep working.
