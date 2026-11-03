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
 *  Tapping a box opens that sensor's pop-up. Override per box with any standard
 *  Home Assistant action (more-info, navigate, url, perform-action, none):
 *
 *    film_tap_action:    { action: more-info, entity: sensor.jellyha_unwatched_movies }
 *    series_tap_action:  { action: navigate, navigation_path: /lovelace/series }
 *    episodes_tap_action: { action: none }
 *    clients_tap_action: { action: more-info, entity: sensor.jellyha_active_sessions }
 *    latest_tap_action:  { action: url, url_path: http://jellyfin.local:8096 }
 *
 *    show_extras: true
 */

class JellyfinLibraryCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      entity: "sensor.jellyha_movies",
      series_entity: "sensor.jellyha_series",
      episodes_entity: "sensor.jellyha_episodes",
      latest_entity: "sensor.jellyha_latest_movie",
      library_entity: "sensor.jellyha_library",
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

  // Visual editor (Home Assistant renders this schema as a form)
  static getConfigForm() {
    const ent = name => ({ name, selector: { entity: { domain: "sensor" } } });
    const act = name => ({ name, selector: { ui_action: {} } });
    const labels = {
      title: "Title", subtitle: "Subtitle",
      entity: "Film count sensor", series_entity: "Series sensor", episodes_entity: "Episodes sensor",
      library_entity: "Library totals sensor (fallback)", clients_entity: "Active clients sensor", latest_entity: "Latest film sensor", version_entity: "Jellyfin version sensor",
      show_extras: "Show series / episodes / clients boxes", show_latest: "Show latest added",
      film_tap_action: "Film count tap action", series_tap_action: "Series tap action",
      episodes_tap_action: "Episodes tap action", clients_tap_action: "Clients tap action",
      latest_tap_action: "Latest added tap action",
      show_now_playing: "Show who's watching", show_paused: "Include paused sessions",
      players: "Limit to these media players (blank = all JellyHA players)",
      tap_actions: "Tap actions", entities: "Entities",
    };
    return {
      schema: [
        {
          type: "grid", name: "", schema: [
            { name: "title", selector: { text: {} } },
            { name: "subtitle", selector: { text: {} } },
          ],
        },
        {
          type: "grid", name: "", schema: [
            { name: "show_extras", selector: { boolean: {} } },
            { name: "show_latest", selector: { boolean: {} } },
          ],
        },
        {
          type: "grid", name: "", schema: [
            { name: "show_now_playing", selector: { boolean: {} } },
            { name: "show_paused", selector: { boolean: {} } },
          ],
        },
        { name: "players", selector: { entity: { domain: "media_player", multiple: true } } },
        {
          type: "expandable", name: "entities", title: "Entities", expanded: true,
          schema: [ent("entity"), ent("series_entity"), ent("episodes_entity"),
                   ent("library_entity"), ent("clients_entity"), ent("latest_entity"), ent("version_entity")],
        },
        {
          type: "expandable", name: "tap_actions", title: "Tap actions",
          schema: [act("film_tap_action"), act("series_tap_action"), act("episodes_tap_action"),
                   act("clients_tap_action"), act("latest_tap_action")],
        },
      ],
      computeLabel: schema => labels[schema.name] || schema.name,
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

  // Finds a library count: configured sensor -> JellyHA library totals sensor -> any matching jellyha sensor.
  _src(kind) {
    const c = this._config;
    const cfg = { movies: c.entity, series: c.series_entity, episodes: c.episodes_entity }[kind];
    const direct = this._state(cfg);
    if (direct && this._num(direct.state) !== null) return { id: cfg, value: this._num(direct.state) };
    const lib = this._state(c.library_entity);
    if (lib && this._num(lib.attributes[kind]) !== null) return { id: c.library_entity, value: this._num(lib.attributes[kind]) };
    if (this._hass) {
      const bad = /unwatched|watched|favorite|latest|percentage|total/;
      for (const [id, st] of Object.entries(this._hass.states)) {
        if (id.startsWith("sensor.") && id.includes("jellyha") && id.endsWith("_" + kind) && !bad.test(id)
            && this._num(st.state) !== null) return { id, value: this._num(st.state) };
      }
    }
    return { id: cfg, value: null };
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
        .chip span { font-size: .58rem; opacity: .65; text-transform: uppercase; letter-spacing: .6px; white-space: nowrap; }
        .latest { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; margin-top: 14px;
          padding: 12px; min-height: 72px; border-radius: 14px; background: rgba(0,0,0,.25) center/cover no-repeat;
          border: 1px solid rgba(255,255,255,.1); }
        .latest::before { content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, rgba(14,16,32,.92) 0%, rgba(14,16,32,.65) 55%, rgba(14,16,32,.25) 100%); }
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
        .row img { width: 38px; height: 56px; object-fit: cover; border-radius: 6px; flex: none; background: rgba(255,255,255,.08); }
        .row .info { flex: 1; min-width: 0; }
        .row .t { font-weight: 600; font-size: .92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .s, .row .who { font-size: .72rem; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .who { opacity: .9; margin-top: 3px; }
        .row .bar { height: 3px; border-radius: 2px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden; }
        .row .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #aa5cc3, #00a4dc); transition: width 1s linear; }
        .row .st { flex: none; --mdc-icon-size: 22px; opacity: .85; }
        .tap { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .15s, background-color .15s; }
        .row.tap:hover { background: rgba(255,255,255,.14); }
        .chip.tap:hover { background: rgba(255,255,255,.16); transform: translateY(-1px); }
        .chip.tap:active, .latest.tap:active { transform: scale(.98); }
        .latest.tap:hover { border-color: rgba(255,255,255,.3); }
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
      latest: [c.latest_entity, c.latest_tap_action],
    };
    if (key.startsWith("player:")) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: key.slice(7) } }));
      return;
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
      if (this._anim) this._anim.main = null;
      this._shown.main = undefined;
      main.innerHTML = `<span class="na">unavailable</span>`;
    }
    else this._animate("main", main, total);

    // Tiles
    const tiles = [
      ["series", "Series", this._src("series").value],
      ["episodes", "Episodes", this._src("episodes").value],
      ["clients", "Active clients", this._state(c.clients_entity) && this._num(this._state(c.clients_entity).state)],
    ].filter(t => t[2] !== null && t[2] !== undefined);
    const extras = r.getElementById("extras");
    const sig = tiles.map(t => t[0]).join();
    if (extras.dataset.sig !== sig) {
      extras.dataset.sig = sig;
      extras.innerHTML = tiles.map(t => `<div class="chip tap" data-key="${t[0]}"><b id="x-${t[0]}">–</b><span>${t[1]}</span></div>`).join("");
    }
    tiles.forEach(t => this._animate(t[0], r.getElementById(`x-${t[0]}`), t[2]));

    this._updateNowPlaying();

    // Latest film added
    const latest = c.show_latest ? this._state(c.latest_entity) : null;
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
          ${a.media_image_url ? `<img src="${this._esc(a.media_image_url)}" alt="" onerror="this.hidden=true">` : ""}
          <div class="info"><div class="t">${this._esc(title)}</div>${sub ? `<div class="s">${this._esc(sub)}</div>` : ""}
            <div class="who">${this._esc(who)}</div><div class="bar"><i data-id="${this._esc(id)}"></i></div></div>
          <ha-icon class="st" icon="${state === "paused" ? "mdi:pause-circle-outline" : "mdi:play-circle-outline"}"></ha-icon></div>`;
      }).join("");
    }
    list.forEach(({ id, a }) => {
      const bar = box.querySelector(`i[data-id="${CSS.escape(id)}"]`);
      if (bar) bar.style.width = Math.max(0, Math.min(100, Number(a.progress_percent) || 0)) + "%";
    });
  }

  _animate(key, el, target) {
    if (!el || this._shown[key] === target) return;
    const start = this._shown[key] ?? 0;
    this._shown[key] = target;
    const token = (this._anim = this._anim || {})[key] = Symbol();
    const dur = 1200, t0 = performance.now();
    const tick = now => {
      if (this._anim[key] !== token) return; // superseded or cancelled
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

customElements.define("jellyfin-library-card", JellyfinLibraryCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "jellyfin-library-card",
  name: "Jellyfin Library Card",
  description: "Film count, library tiles and latest addition with backdrop art for the JellyHA integration.",
});
