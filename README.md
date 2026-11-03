# Jellyfin Library Card

A Home Assistant Lovelace card for the [JellyHA](https://github.com/zupancicmarko/JellyHA) integration.

![Preview](preview.png)

*Preview uses sample data and stand-in artwork.*

## Features
- Big animated film count
- Series, episode and active-client boxes
- Jellyfin version badge
- **Now watching**: every client currently playing (or paused), with poster, user, device and progress. Hidden when nobody is watching
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
| `series_entity` | `sensor.jellyha_series` | Series count |
| `episodes_entity` | `sensor.jellyha_episodes` | Episode count |
| `clients_entity` | `sensor.jellyha_connected_clients` | Active clients |
| `latest_entity` | `sensor.jellyha_latest_movie` | Latest film |
| `version_entity` | `sensor.jellyha_jellyfin_version` | Jellyfin version |
| `title` / `subtitle` | `Film Collection` / `Jellyfin` | Header text |
| `show_extras` | `true` | Series / episodes / clients boxes |
| `show_latest` | `true` | Latest added section |
| `show_now_playing` | `true` | Now watching list |
| `show_paused` | `true` | Include paused sessions |
| `players` | all `media_player.jellyha_*` | Limit Now watching to these players |
| `*_tap_action` | `more-info` | `film_`, `series_`, `episodes_`, `clients_`, `latest_` tap actions |
