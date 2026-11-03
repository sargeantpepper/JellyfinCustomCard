/**
 * Jellyfin Library Card for Home Assistant  (built for the JellyHA integration)
 * -----------------------------------------------------------------------------
 * Shows how many films are in your collection, series / episode / active-client tiles and the latest film added.
 *
 * Everything below can also be set in the visual editor (Edit card > no YAML needed).
 *
 * INSTALL
 *  1. Copy to /config/www/jellyfin-library-card.js
 *  2. Settings > Dashboards > Resources > Add: /local/jellyfin-library-card.js (JavaScript module)
 *  3. Add the card:
 *
 *    type: custom:jellyfin-library-card
 *
 *  That's it - all entities default to the JellyHA names. Optional overrides:
 *
 *    entity: sensor.jellyha_movies
 *    series_entity: sensor.jellyha_series
 *    episodes_entity: sensor.jellyha_episodes
 *    latest_entity: sensor.jellyha_latest_movie
 *    library_entity: sensor.jellyha_library    # fallback: uses its movies/series/episodes attributes
 *    clients_entity: sensor.jellyha_connected_clients
 *    version_entity: sensor.jellyha_jellyfin_version
 *    title: Film Collection
 *    subtitle: Jellyfin
 *    show_latest: true
 *    show_now_playing: true     # "Now watching" list; hidden entirely when nobody is playing
 *    show_paused: true          # include paused sessions
 *    players: [media_player.jellyha_admin]   # optional; default = all media_player.jellyha_* players
 *
 *  BOXES - up to four boxes under the film count. Add, remove and reorder them in the visual
 *  editor, or in YAML (remove the list, or use `boxes: []`, to hide the row):
 *
 *    boxes:
 *      - type: series          # series | episodes | songs | albums | artists | videos | movies | clients
 *                              # | disk_used | disk_free | library_size | custom
 *      - type: episodes
 *      - type: songs
 *      - type: custom          # any numeric sensor
 *        name: Playlists       # optional label
 *        entity: sensor.my_playlists
 *        attribute: count      # optional, read an attribute instead of the state
 *        tap_action: { action: none }   # optional
 *
 *  Default (no `boxes`): series, episodes, active clients.
 *  disk_used / disk_free read sensor.jellyha_media_storage_free; library_size adds up every
 *  sensor.jellyha_library_*_storage_size. Songs/albums/artists/videos come from the library sensor's attributes.
 *  The older box1_type ... box4_type settings still work if you have them.
 *
 *  Tapping a box opens that sensor's pop-up. Override per box with any standard
 *  Home Assistant action (more-info, navigate, url, perform-action, none):
 *
 *    film_tap_action:    { action: more-info, entity: sensor.jellyha_unwatched_movies }
 *    latest_tap_action:  { action: url, url_path: http://jellyfin.local:8096 }
 *
 *    show_extras: true
 */

class JellyfinLibraryCard extends HTMLElement {
  setConfig(config) {
    // Earlier editor versions saved grouped fields nested (e.g. box1: {box1_type: ...}); flatten them.
    const flat = { ...config };
    for (const k of ["entities", "tap_actions", "box1", "box2", "box3", "box4"]) {
      if (flat[k] && typeof flat[k] === "object" && !Array.isArray(flat[k])) {
        const inner = flat[k]; delete flat[k];
        for (const [ik, iv] of Object.entries(inner)) if (!(ik in config)) flat[ik] = iv;
      }
    }
    config = flat;
    this._config = {
      entity: "sensor.jellyha_movies",
      series_entity: "sensor.jellyha_series",
      episodes_entity: "sensor.jellyha_episodes",
      latest_entity: "sensor.jellyha_latest_movie",
      library_entity: "sensor.jellyha_library",
      storage_entity: "sensor.jellyha_media_storage_free",
      clients_entity: "sensor.jellyha_connected_clients",
      version_entity: "sensor.jellyha_jellyfin_version",
      title: "Film Collection",
      subtitle: "Jellyfin",
      show_latest: true,
      show_now_playing: true,
      show_paused: true,
      show_extras: true,
      ...config,
    };
    this._shown = {};
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.shadowRoot && this._config) this._update();
  }

  getCardSize() { return 4; }
  static getStubConfig() {
    return {
      entity: "sensor.jellyha_movies",
      series_entity: "sensor.jellyha_series",
      episodes_entity: "sensor.jellyha_episodes",
      clients_entity: "sensor.jellyha_connected_clients",
      latest_entity: "sensor.jellyha_latest_movie",
      version_entity: "sensor.jellyha_jellyfin_version",
    };
  }

  // Boxes: use the `boxes` list if present, otherwise the older box1_type..box4_type settings.
  static _specsFromConfig(c) {
    const clean = o => { const r = {}; for (const k of ["type", "name", "entity", "attribute", "tap_action"])
      if (o[k] !== undefined && o[k] !== "" && o[k] !== null) r[k] = o[k]; return r; };
    if (Array.isArray(c.boxes)) return c.boxes.slice(0, 4).filter(b => b && b.type && b.type !== "none").map(clean);
    const defaults = ["series", "episodes", "clients", "none"];
    const out = [];
    for (let n = 1; n <= 4; n++) {
      const type = c[`box${n}_type`] ?? defaults[n - 1];
      if (type === "none") continue;
      out.push(clean({ type, name: c[`box${n}_name`], entity: c[`box${n}_entity`],
                       attribute: c[`box${n}_attribute`], tap_action: c[`box${n}_tap_action`] }));
    }
    return out;
  }

  static getConfigElement() { return document.createElement("jellyfin-library-card-editor"); }

  // Schema for the general (non-box) options, rendered by Home Assistant's form in the editor.
  static _generalSchema() {
    const ent = name => ({ name, selector: { entity: { domain: "sensor" } } });
    const act = name => ({ name, selector: { ui_action: {} } });
    const labels = {
      title: "Title", subtitle: "Subtitle",
      entity: "Film count sensor", library_entity: "Library totals sensor (fallback, also used for songs/albums)",
      storage_entity: "Disk storage sensor (for disk used / free)", clients_entity: "Active clients sensor", latest_entity: "Latest film sensor", version_entity: "Jellyfin version sensor",
      show_extras: "Show the boxes", show_latest: "Show latest added",
      show_now_playing: "Show who's watching", show_paused: "Include paused sessions",
      players: "Limit to these media players (blank = all JellyHA players)",
      film_tap_action: "Film count tap action", latest_tap_action: "Latest added tap action",
    };
    return {
      labels,
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } }, { name: "subtitle", selector: { text: {} } } ] },
        { type: "grid", name: "", schema: [
          { name: "show_extras", selector: { boolean: {} } }, { name: "show_latest", selector: { boolean: {} } } ] },
        { type: "grid", name: "", schema: [
          { name: "show_now_playing", selector: { boolean: {} } }, { name: "show_paused", selector: { boolean: {} } } ] },
        { name: "players", selector: { entity: { domain: "media_player", multiple: true } } },
        { type: "expandable", name: "", title: "Entities", expanded: false,
          schema: [ent("entity"), ent("library_entity"), ent("storage_entity"), ent("clients_entity"), ent("latest_entity"), ent("version_entity")] },
        { type: "expandable", name: "", title: "Other tap actions",
          schema: [act("film_tap_action"), act("latest_tap_action")] },
      ],
    };
  }

  _state(id) {
    const s = id && this._hass ? this._hass.states[id] : null;
    return s && s.state !== "unavailable" && s.state !== "unknown" ? s : null;
  }
  _num(v) {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  // Resolves one of the four configurable boxes (box1..box4).
  _box(n) {
    const c = this._config, sp = JellyfinLibraryCard._specsFromConfig(c)[n - 1];
    if (!sp) return null;
    const type = sp.type, ent = sp.entity, attr = sp.attribute;
    let id, value = null, text, st = null;
    if (ent) {
      // any sensor: show decimals and the sensor's unit when it has them
      st = this._state(ent); id = ent;
      const f = st ? parseFloat(attr ? st.attributes[attr] : st.state) : NaN;
      if (!Number.isNaN(f)) {
        const unit = attr ? "" : st.attributes.unit_of_measurement;
        if (unit || !Number.isInteger(f)) text = this._fmtNum(f) + (unit ? `<small>${this._esc(unit)}</small>` : "");
        else value = f;
      }
    } else if (type === "clients") {
      st = this._state(c.clients_entity); id = c.clients_entity;
      if (st) value = this._num(st.state);
    } else if (type === "disk_free" || type === "disk_used") {
      ({ id, text } = this._disk(type));
    } else if (type === "library_size") {
      ({ id, text } = this._libSize());
    } else if (type !== "custom") {
      ({ id, value } = this._src(type));
    }
    const names = { movies: "Films", series: "Series", episodes: "Episodes", songs: "Songs", albums: "Albums",
                    artists: "Artists", videos: "Videos", clients: "Active clients",
                    disk_free: "Disk free", disk_used: "Disk used", library_size: "Library size" };
    const label = sp.name || (type === "custom" || ent ? (st && st.attributes.friendly_name) || ent : names[type] || type);
    return { n, type, id, value, text, label, action: sp.tap_action || c[`${type}_tap_action`] };
  }

  _fmtNum(v) { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

  // Bytes -> "12.4 TB". Uses 1024 or 1000 steps to match the storage sensor's own numbers.
  _fmtBytes(bytes, base) {
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0, v = Number(bytes);
    while (v >= base && i < units.length - 1) { v /= base; i++; }
    const d = v >= 100 || i < 3 ? 0 : v >= 10 ? 1 : 2;
    return `${this._fmtNum(Number(v.toFixed(d)))}<small>${units[i]}</small>`;
  }

  _storageSensor() {
    const c = this._config;
    const st = this._state(c.storage_entity);
    if (st) return { id: c.storage_entity, st };
    if (this._hass) for (const [id, s] of Object.entries(this._hass.states))
      if (id.startsWith("sensor.") && id.includes("jellyha") && /media_storage_free$/.test(id) && s.state !== "unavailable") return { id, st: s };
    return { id: c.storage_entity, st: null };
  }

  _base(a) {
    // total_bytes / total_tb tells us whether the integration divides by 1024 or 1000
    const r = Number(a.total_bytes) / Number(a.total_tb);
    return r > 1.05e12 ? 1024 : 1000;
  }

  _disk(type) {
    const { id, st } = this._storageSensor();
    if (!st) return { id };
    const a = st.attributes;
    const bytes = type === "disk_free" ? Number(a.free_bytes) : Number(a.used_bytes);
    if (Number.isNaN(bytes)) return { id };
    return { id, text: this._fmtBytes(bytes, this._base(a)) };
  }

  // Combined size of all libraries (sensor.jellyha_library_*_storage_size)
  _libSize() {
    if (!this._hass) return {};
    const subs = Object.entries(this._hass.states).filter(([id, s]) =>
      /^sensor\.jellyha_library_.*_storage_size$/.test(id) && s.state !== "unavailable" && s.state !== "unknown");
    if (!subs.length) return { id: "sensor.jellyha_library" };
    let total = 0;
    for (const [, s] of subs) {
      const b = Number(s.attributes.size_bytes);
      total += !Number.isNaN(b) ? b : (parseFloat(s.state) || 0) * 1e9;
    }
    return { id: subs[0][0], text: this._fmtBytes(total, this._base(this._storageSensor().st ? this._storageSensor().st.attributes : {})) };
  }

  // The kind's own sensor (e.g. sensor.jellyha_series) if it exists at all, even when its state is unusable.
  _own(kind) {
    const c = this._config;
    const cfg = { movies: c.entity, series: c.series_entity, episodes: c.episodes_entity }[kind] || `sensor.jellyha_${kind}`;
    if (!this._hass) return null;
    if (this._hass.states[cfg]) return cfg;
    const bad = /unwatched|watched|favorite|latest|percentage|total/;
    return Object.keys(this._hass.states).find(id => id.startsWith("sensor.") && id.includes("jellyha")
      && id.endsWith("_" + kind) && !bad.test(id)) || null;
  }

  _src(kind) {
    const c = this._config;
    const cfg = { movies: c.entity, series: c.series_entity, episodes: c.episodes_entity }[kind] || `sensor.jellyha_${kind}`;
    const direct = this._state(cfg);
    if (direct && this._num(direct.state) !== null) return { id: cfg, value: this._num(direct.state) };
    const lib = this._state(c.library_entity);
    if (lib && this._num(lib.attributes[kind]) !== null) return { id: this._own(kind) || c.library_entity, value: this._num(lib.attributes[kind]) };
    if (this._hass) {
      const bad = /unwatched|watched|favorite|latest|percentage|total/;
      for (const [id, st] of Object.entries(this._hass.states)) {
        if (id.startsWith("sensor.") && id.includes("jellyha") && id.endsWith("_" + kind) && !bad.test(id)
            && this._num(st.state) !== null) return { id, value: this._num(st.state) };
      }
    }
    return { id: cfg, value: null };
  }

  // Latest film sensor: configured entity, else any jellyha "latest ... movie/film" sensor.
  _latest() {
    const direct = this._state(this._config.latest_entity);
    if (direct) return direct;
    if (!this._hass) return null;
    for (const [id, st] of Object.entries(this._hass.states)) {
      if (id.startsWith("sensor.") && id.includes("jellyha") && /latest/.test(id) && /movie|film/.test(id)
          && st.state !== "unavailable" && st.state !== "unknown") return st;
    }
    return null;
  }

  _render() {
    const c = this._config;
    const holes = Array.from({ length: 14 }, () => "<i></i>").join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          position: relative; overflow: hidden; padding: 22px 24px 24px;
          color: #fff; border: none;
          background:
            radial-gradient(120% 140% at 100% 0%, rgba(0,164,220,.55) 0%, transparent 55%),
            radial-gradient(100% 120% at 0% 100%, rgba(170,92,195,.60) 0%, transparent 60%),
            linear-gradient(135deg, #1b1b2f 0%, #16213e 100%);
        }
        .strip { position: absolute; left: 0; right: 0; height: 14px; display: flex;
          justify-content: space-around; align-items: center; background: rgba(0,0,0,.35); opacity: .75; }
        .strip.top { top: 0; } .strip.bottom { bottom: 0; }
        .strip i { width: 9px; height: 6px; border-radius: 2px; background: rgba(255,255,255,.35); }
        .wrap { position: relative; margin: 6px 0 2px; }
        .head { display: flex; align-items: center; gap: 12px; }
        .logo { width: 40px; height: 40px; border-radius: 12px; flex: none; display: grid; place-items: center;
          background: linear-gradient(135deg, #aa5cc3, #00a4dc); box-shadow: 0 4px 14px rgba(0,164,220,.4); }
        .logo ha-icon { --mdc-icon-size: 24px; color: #fff; }
        .title { font-size: 1.05rem; font-weight: 600; }
        .subtitle { font-size: .75rem; opacity: .65; text-transform: uppercase; letter-spacing: 1.4px; }
        #ver { text-transform: none; margin-left: 8px; padding: 1px 7px; border-radius: 8px; background: rgba(255,255,255,.14); letter-spacing: .5px; }
        .hero { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 4px; }
        .num { display: flex; align-items: baseline; gap: 10px; }
        .count { font-size: 3.6rem; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums;
          background: linear-gradient(90deg, #fff, #bfe9ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .unit { font-size: 1rem; opacity: .75; }
        .na { opacity: .6; font-size: 1rem; -webkit-text-fill-color: #fff; font-weight: 500; }
        .extras { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
        .chip { padding: 9px 10px; border-radius: 14px; background: rgba(255,255,255,.09);
          backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,.12); min-width: 0; }
        .chip b { display: block; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
        .chip b small { font-size: .55em; font-weight: 600; opacity: .7; margin-left: 3px; letter-spacing: .5px; }
        .chip span { font-size: .54rem; opacity: .65; text-transform: uppercase; letter-spacing: .35px; white-space: nowrap; display: block; overflow: hidden; text-overflow: ellipsis; }
        .latest { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; margin-top: 14px;
          padding: 12px; min-height: 72px; border-radius: 14px; background: rgba(0,0,0,.25) center/cover no-repeat;
          border: 0; }
        .latest::before { content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, rgba(14,16,32,.94) 0%, rgba(14,16,32,.72) 55%, rgba(14,16,32,.5) 100%); }
        .latest::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          border: 1px solid rgba(255,255,255,.12); }
        .latest > * { position: relative; }
        .latest img { width: 44px; height: 66px; box-shadow: 0 4px 12px rgba(0,0,0,.5); object-fit: cover; border-radius: 6px; flex: none; background: rgba(255,255,255,.08); }
        .latest .lbl { font-size: .6rem; opacity: .6; text-transform: uppercase; letter-spacing: 1.2px; }
        .latest .t { font-weight: 600; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .latest .y { font-size: .75rem; opacity: .65; }
        .latest > div { min-width: 0; }
        .nowp { margin-top: 14px; }
        .nowp .hd { font-size: .6rem; opacity: .65; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 2px 8px;
          display: flex; align-items: center; gap: 6px; }
        .nowp .dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80;
          animation: pulse 1.8s infinite; }
        @keyframes pulse { 50% { opacity: .35; } }
        .row { display: flex; align-items: center; gap: 12px; padding: 8px; margin-bottom: 8px; border-radius: 14px;
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); position: relative; overflow: hidden; }
        .row:last-child { margin-bottom: 0; }
        .row .art { width: 38px; height: 56px; flex: none; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,.08);
          display: grid; place-items: center; }
        .row .art.ph ha-icon { --mdc-icon-size: 22px; opacity: .5; }
        .row .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .row img.unused { width: 38px; height: 56px; object-fit: cover; border-radius: 6px; flex: none; background: rgba(255,255,255,.08); }
        .row .info { flex: 1; min-width: 0; }
        .row .t { font-weight: 600; font-size: .92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .s, .row .who { font-size: .72rem; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .who { opacity: .9; margin-top: 3px; }
        .row .bar { height: 3px; border-radius: 2px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden; }
        .row .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #aa5cc3, #00a4dc); transition: width 1s linear; }
        .row .times { display: flex; justify-content: space-between; margin-top: 4px; font-size: .66rem; opacity: .7;
          font-variant-numeric: tabular-nums; letter-spacing: .3px; }
        .row .st { flex: none; --mdc-icon-size: 22px; opacity: .85; }
        .tap { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .15s, background-color .15s; }
        .row.tap:hover { background: rgba(255,255,255,.14); }
        .chip.tap:hover { background: rgba(255,255,255,.16); transform: translateY(-1px); }
        .chip.tap:active, .latest.tap:active { transform: scale(.98); }
        .latest.tap:hover::after { border-color: rgba(255,255,255,.3); }
        .num.tap:hover { opacity: .85; }
        [hidden] { display: none !important; }
      </style>
      <ha-card>
        <div class="strip top">${holes}</div>
        <div class="wrap">
          <div class="head">
            <div class="logo"><ha-icon icon="mdi:filmstrip"></ha-icon></div>
            <div><div class="title">${this._esc(c.title)}</div><div class="subtitle"><span>${this._esc(c.subtitle)}</span><span id="ver"></span></div></div>
          </div>
          <div class="hero">
            <div class="num tap" data-key="films"><span class="count" id="main">–</span><span class="unit">films</span></div>
          </div>
          <div class="extras" id="extras" ${c.show_extras ? "" : "hidden"}></div>
          <div class="nowp" id="nowp" hidden></div>
          <div class="latest tap" data-key="latest" id="latest" hidden>
            <img id="poster" alt="" />
            <div><div class="lbl">Latest added</div><div class="t" id="lt"></div><div class="y" id="ly"></div></div>
          </div>
        </div>
        <div class="strip bottom">${holes}</div>
      </ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", e => {
      const el = e.target.closest(".tap");
      if (el) this._handleTap(el.dataset.key);
    });
    this._update();
  }

  _handleTap(key) {
    const c = this._config;
    const map = {
      films: [this._src("movies").id || c.entity, c.film_tap_action],
      series: [this._src("series").id || c.series_entity, c.series_tap_action],
      episodes: [this._src("episodes").id || c.episodes_entity, c.episodes_tap_action],
      clients: [c.clients_entity, c.clients_tap_action],
      latest: [(this._latest() || {}).entity_id || c.latest_entity, c.latest_tap_action],
    };
    if (key.startsWith("player:")) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: key.slice(7) } }));
      return;
    }
    if (/^box[1-4]$/.test(key)) {
      const bx = this._box(Number(key[3]));
      if (bx) map[key] = [bx.id, bx.action];
    }
    const [entity, custom] = map[key] || [];
    const action = custom || { action: "more-info" };
    if (action.action === "none") return;
    if (action.action === "more-info") {
      const id = action.entity || entity;
      if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
      return;
    }
    // navigate / url / perform-action / call-service are handled by Home Assistant itself
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true,
      detail: { config: { entity, tap_action: action }, action: "tap" },
    }));
  }

  _update() {
    const c = this._config, r = this.shadowRoot;
    const main = r.getElementById("main");
    if (!main) return;

    // Jellyfin version
    const ver = this._state(c.version_entity);
    const verEl = r.getElementById("ver");
    verEl.hidden = !ver;
    if (ver) verEl.textContent = "v" + String(ver.state).replace(/^v/i, "");

    // Film count
    const total = this._src("movies").value;
    if (total === null) {
      main._tok = null;
      main._val = undefined;
      main.innerHTML = `<span class="na">unavailable</span>`;
    }
    else {
      if (main.querySelector(".na")) { main.textContent = "–"; main._val = undefined; }
      this._animate("main", main, total);
    }

    // Tiles
    const tiles = [1, 2, 3, 4].map(n => this._box(n)).filter(t => t && ((t.value !== null && t.value !== undefined) || t.text !== undefined));
    const extras = r.getElementById("extras");
    extras.hidden = !c.show_extras || !tiles.length;
    const sig = tiles.map(t => `${t.n}:${t.label}`).join("|");
    if (extras.dataset.sig !== sig) {
      extras.dataset.sig = sig;
      extras.innerHTML = tiles.map(t => `<div class="chip tap" data-key="box${t.n}"><b id="x-box${t.n}">–</b><span>${this._esc(t.label)}</span></div>`).join("");
    }
    tiles.forEach(t => {
      const el = r.getElementById(`x-box${t.n}`);
      if (t.text !== undefined) { el._tok = null; el._val = undefined; if (el.innerHTML !== t.text) el.innerHTML = t.text; }
      else this._animate(`box${t.n}`, el, t.value);
    });

    this._updateNowPlaying();

    // Latest film added
    const latest = c.show_latest ? this._latest() : null;
    const box = r.getElementById("latest");
    if (latest) {
      box.hidden = false;
      const at = latest.attributes;
      r.getElementById("lt").textContent = at.title || latest.state;
      r.getElementById("ly").textContent = [at.year, at.resolution, at.genres && [].concat(at.genres).slice(0, 2).join(", ")]
        .filter(Boolean).join(" · ");
      box.style.backgroundImage = at.backdrop_url ? `url("${at.backdrop_url}")` : "";
      const img = r.getElementById("poster");
      if (at.poster_url) { img.hidden = false; img.src = at.poster_url; img.onerror = () => (img.hidden = true); }
      else img.hidden = true;
    } else box.hidden = true;
  }

  // Sessions that are actually playing (or paused). Idle clients are ignored.
  _activeSessions() {
    if (!this._hass) return [];
    const c = this._config, st = this._hass.states;
    const ids = Array.isArray(c.players) && c.players.length
      ? c.players
      : Object.keys(st).filter(id => id.startsWith("media_player.jellyha_") && id !== "media_player.jellyha_library_browser");
    const seen = new Set(), out = [];
    for (const id of ids) {
      const e = st[id];
      if (!e) continue;
      if (e.state !== "playing" && !(c.show_paused && e.state === "paused")) continue;
      const a = e.attributes;
      if (!a.media_title && !a.media_series_title) continue;
      const key = a.session_id || `${a.user_name}|${a.device_name}|${a.item_id}`;
      if (seen.has(key)) continue; // per-user and per-device players can describe the same session
      seen.add(key);
      out.push({ id, state: e.state, a });
    }
    return out;
  }

  // Try each candidate artwork URL in turn (HA's proxied entity_picture first); fall back to an icon.
  _loadArt(el) {
    let srcs = [];
    try { srcs = JSON.parse(el.dataset.srcs || "[]"); } catch (e) { /* ignore */ }
    const fallback = () => { el.innerHTML = '<ha-icon icon="mdi:movie-open"></ha-icon>'; el.classList.add("ph"); };
    const next = () => {
      const src = srcs.shift();
      if (!src) return fallback();
      const img = new Image();
      img.alt = "";
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; img.src = ""; next(); } }, 3500); // unreachable host
      img.onload = () => { if (done) return; done = true; clearTimeout(timer); el.innerHTML = ""; el.appendChild(img); };
      img.onerror = () => { if (done) return; done = true; clearTimeout(timer); next(); };
      img.src = src;
    };
    next();
  }

  _updateNowPlaying() {
    const box = this.shadowRoot.getElementById("nowp");
    const list = this._config.show_now_playing ? this._activeSessions() : [];
    if (!list.length) { box.hidden = true; box.dataset.sig = ""; box.innerHTML = ""; return; }
    box.hidden = false;
    const sig = list.map(x => `${x.id}|${x.state}|${x.a.item_id || x.a.media_title}`).join(";");
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = `<div class="hd"><span class="dot"></span>Now watching</div>` + list.map(({ id, state, a }) => {
        const ep = a.media_series_title;
        const title = ep ? a.media_series_title : a.media_title;
        const sub = ep
          ? [a.media_season != null && a.media_episode != null ? `S${a.media_season}E${a.media_episode}` : null, a.media_title].filter(Boolean).join(" · ")
          : [a.year, a.official_rating].filter(Boolean).join(" · ");
        const who = [a.user_name, a.device_name].filter(Boolean).join(" on ");
        return `<div class="row tap" data-key="player:${this._esc(id)}">
          <div class="art" data-srcs="${this._esc(JSON.stringify([a.entity_picture, a.media_image_url, a.entity_picture_local, a.poster_url].filter(Boolean)))}"></div>
          <div class="info"><div class="t">${this._esc(title)}</div>${sub ? `<div class="s">${this._esc(sub)}</div>` : ""}
            <div class="who">${this._esc(who)}</div><div class="bar"><i data-id="${this._esc(id)}"></i></div>
            <div class="times" data-id="${this._esc(id)}"><span class="el">–</span><span class="rem"></span></div></div>
          <ha-icon class="st" icon="${state === "paused" ? "mdi:pause-circle-outline" : "mdi:play-circle-outline"}"></ha-icon></div>`;
      }).join("");
      box.querySelectorAll(".art").forEach(el => this._loadArt(el));
    }
    this._rows = list;
    this._tickTimes();
    // keep elapsed/remaining moving between state updates while something is playing
    const playing = list.some(x => x.state === "playing");
    if (playing && !this._timer) this._timer = setInterval(() => this._tickTimes(), 1000);
    if (!playing && this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  disconnectedCallback() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
  }

  _tickTimes() {
    const box = this.shadowRoot && this.shadowRoot.getElementById("nowp");
    if (!box || !this._rows) return;
    this._pos = this._pos || {};
    for (const { id, state, a } of this._rows) {
      let dur = Number(a.media_duration) || (Number(a.runtime_minutes) || 0) * 60;
      let pos = Number(a.media_position);
      if (!(pos >= 0)) pos = dur && a.progress_percent != null ? (Number(a.progress_percent) / 100) * dur : NaN;
      let elapsed = pos;
      if (state === "playing" && !Number.isNaN(pos)) {
        // add the time since the position was last reported
        const upd = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : NaN;
        let base;
        if (!Number.isNaN(upd)) base = upd;
        else {
          const rec = this._pos[id];
          if (!rec || rec.pos !== pos) this._pos[id] = { pos, ts: Date.now() };
          base = this._pos[id].ts;
        }
        elapsed = pos + Math.max(0, (Date.now() - base) / 1000);
      }
      if (dur) elapsed = Math.min(elapsed, dur);
      const row = box.querySelector(`.times[data-id="${CSS.escape(id)}"]`);
      if (row && !Number.isNaN(elapsed)) {
        row.querySelector(".el").textContent = this._fmt(elapsed);
        row.querySelector(".rem").textContent = dur ? "-" + this._fmt(dur - elapsed) : "";
      }
      const bar = box.querySelector(`i[data-id="${CSS.escape(id)}"]`);
      if (bar) {
        const pct = dur && !Number.isNaN(elapsed) ? (elapsed / dur) * 100 : Number(a.progress_percent) || 0;
        bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
      }
    }
  }

  // Count-up animation. State lives on the element, so a rebuilt element always gets its number.
  _animate(key, el, target) {
    if (!el || el._val === target) return;
    const start = el._val ?? 0;
    el._val = target;
    const token = (el._tok = Symbol());
    const dur = 1200, t0 = performance.now();
    const tick = now => {
      if (el._tok !== token) return; // superseded or cancelled
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _esc(s) {
    return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }
}

/* ------------------------------ Visual editor ------------------------------ */
class JellyfinLibraryCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._boxes = null; this._forms = []; }

  set hass(h) { this._hass = h; if (this._gen) this._gen.hass = h; this._forms.forEach(f => (f.hass = h)); }

  setConfig(config) {
    this._config = { ...config };
    const incoming = JellyfinLibraryCard._specsFromConfig(this._config);
    const changed = this._boxes === null || JSON.stringify(incoming) !== JSON.stringify(this._boxes);
    if (!this._built) this._build();
    if (changed) { this._boxes = incoming.map(b => ({ ...b })); this._renderBoxes(); }
    this._gen.data = this._generalData();
  }

  _generalData() {
    const d = { ...this._config }; delete d.boxes;
    for (const k of Object.keys(d)) if (/^box[1-4]($|_)/.test(k) || k === "entities" || k === "tap_actions") delete d[k];
    return d;
  }

  _emit(general) {
    const config = { ...(general || this._generalData()), boxes: this._boxes.map(b => ({ ...b })) };
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _build() {
    this._built = true;
    const { schema, labels } = JellyfinLibraryCard._generalSchema();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        h3 { margin: 18px 0 4px; font-size: 1rem; font-weight: 500; color: var(--primary-text-color); }
        .hint { font-size: .8rem; color: var(--secondary-text-color); margin: 0 0 10px; }
        .box { border: 1px solid var(--divider-color); border-radius: 12px; padding: 4px 12px 10px; margin-bottom: 10px;
          background: var(--card-background-color, transparent); }
        .hd { display: flex; align-items: center; gap: 4px; padding: 6px 0; }
        .num { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex: none; font-size: .8rem;
          background: var(--primary-color); color: var(--text-primary-color, #fff); }
        .ttl { flex: 1; margin-left: 8px; font-weight: 500; color: var(--primary-text-color); }
        button { cursor: pointer; border: 0; background: transparent; color: var(--primary-text-color); width: 34px; height: 34px;
          border-radius: 50%; font-size: 1.05rem; line-height: 1; }
        button:hover:not(:disabled) { background: var(--secondary-background-color); }
        button:disabled { opacity: .3; cursor: default; }
        button.rm:hover:not(:disabled) { color: var(--error-color, #db4437); }
        .add { width: 100%; height: 40px; border-radius: 10px; border: 1px dashed var(--primary-color);
          color: var(--primary-color); font-size: .95rem; }
        .empty { padding: 14px; text-align: center; color: var(--secondary-text-color); border: 1px dashed var(--divider-color);
          border-radius: 12px; margin-bottom: 10px; font-size: .9rem; }
      </style>
      <ha-form id="gen"></ha-form>
      <h3>Boxes</h3>
      <p class="hint">Up to 4 boxes under the film count. Remove them all to hide the row.</p>
      <div id="list"></div>
      <button class="add" id="add">+ Add box</button>`;
    this._gen = this.shadowRoot.getElementById("gen");
    this._gen.schema = schema;
    this._gen.computeLabel = s => labels[s.name] || s.name;
    if (this._hass) this._gen.hass = this._hass;
    this._gen.addEventListener("value-changed", e => {
      e.stopPropagation();
      if (this._boxes) this._emit({ ...e.detail.value });
    });
    this.shadowRoot.getElementById("add").addEventListener("click", () => {
      if (this._boxes.length >= 4) return;
      const order = ["series", "episodes", "songs", "albums", "artists", "videos", "clients", "movies", "disk_used", "disk_free", "library_size"];
      const used = new Set(this._boxes.map(b => b.type));
      this._boxes.push({ type: order.find(t => !used.has(t)) || "custom" });
      this._renderBoxes(); this._emit();
    });
  }

  _renderBoxes() {
    const list = this.shadowRoot.getElementById("list");
    list.innerHTML = ""; this._forms = [];
    const TYPES = [["series", "Series"], ["episodes", "Episodes"], ["songs", "Songs"], ["albums", "Albums"],
      ["artists", "Artists"], ["videos", "Videos"], ["movies", "Films"], ["clients", "Active clients"],
      ["disk_used", "Disk used"], ["disk_free", "Disk free"], ["library_size", "Library size"], ["custom", "Custom sensor"]];
    const typeLabel = t => (TYPES.find(x => x[0] === t) || [, t])[1];
    const schema = [
      { name: "type", selector: { select: { mode: "dropdown", options: TYPES.map(([value, label]) => ({ value, label })) } } },
      { type: "expandable", name: "", title: "Label, sensor and tap action", schema: [
        { name: "name", selector: { text: {} } },
        { name: "entity", selector: { entity: {} } },
        { name: "attribute", selector: { text: {} } },
        { name: "tap_action", selector: { ui_action: {} } } ] },
    ];
    const labels = { type: "What to count", name: "Label (optional)", entity: "Sensor (optional, overrides the type)",
      attribute: "Attribute to read (optional)", tap_action: "Tap action" };

    if (!this._boxes.length) {
      const e = document.createElement("div"); e.className = "empty"; e.textContent = "No boxes: the row is hidden.";
      list.appendChild(e);
    }
    this._boxes.forEach((box, i) => {
      const wrap = document.createElement("div"); wrap.className = "box";
      wrap.innerHTML = `<div class="hd"><span class="num">${i + 1}</span><span class="ttl"></span>
        <button class="up" title="Move up">▲</button><button class="down" title="Move down">▼</button>
        <button class="rm" title="Remove">✕</button></div>`;
      const ttl = wrap.querySelector(".ttl"); ttl.textContent = typeLabel(box.type);
      const up = wrap.querySelector(".up"), down = wrap.querySelector(".down"), rm = wrap.querySelector(".rm");
      up.disabled = i === 0; down.disabled = i === this._boxes.length - 1;
      const move = d => { const j = i + d; [this._boxes[i], this._boxes[j]] = [this._boxes[j], this._boxes[i]];
        this._renderBoxes(); this._emit(); };
      up.addEventListener("click", () => move(-1));
      down.addEventListener("click", () => move(1));
      rm.addEventListener("click", () => { this._boxes.splice(i, 1); this._renderBoxes(); this._emit(); });
      const form = document.createElement("ha-form");
      form.schema = schema; form.data = { ...box }; form.computeLabel = s => labels[s.name] || s.name;
      if (this._hass) form.hass = this._hass;
      form.addEventListener("value-changed", e => {
        e.stopPropagation();
        const v = {}; for (const [k, val] of Object.entries(e.detail.value)) if (val !== undefined && val !== "" && val !== null) v[k] = val;
        if (!v.type) v.type = box.type;
        this._boxes[i] = v; ttl.textContent = typeLabel(v.type); this._emit();
      });
      wrap.appendChild(form); list.appendChild(wrap); this._forms.push(form);
    });
    this.shadowRoot.getElementById("add").hidden = this._boxes.length >= 4;
  }
}
customElements.define("jellyfin-library-card-editor", JellyfinLibraryCardEditor);

customElements.define("jellyfin-library-card", JellyfinLibraryCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "jellyfin-library-card",
  name: "Jellyfin Library Card",
  description: "Film count, library tiles and latest addition with backdrop art for the JellyHA integration.",
});
