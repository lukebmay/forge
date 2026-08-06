// Mock Shell namespace

export class App {
  constructor(params = {}) {
    this.id = params.id || "mock.app";
    this.name = params.name || "Mock App";
  }

  get_id() {
    return this.id;
  }

  get_name() {
    return this.name;
  }

  activate() {
    // GNOME Shell App.activate — dock hook may wrap this
  }

  open_new_window(_workspace) {
    // GNOME Shell App.open_new_window
  }

  create_icon_texture(size) {
    return {
      width: size,
      height: size,
      set_size: () => {},
      destroy: () => {},
    };
  }
}

export class WindowTracker {
  static get_default() {
    return new WindowTracker();
  }

  get_window_app(window) {
    return new App();
  }
}

/** Map of desktop-id → App for preferChromePwaApp / tab icon tests. */
const _appSystemApps = new Map();

export class AppSystem {
  static get_default() {
    return new AppSystem();
  }

  /** @param {string} id @param {App} app */
  static _registerForTests(id, app) {
    _appSystemApps.set(id, app);
  }

  static _clearForTests() {
    _appSystemApps.clear();
  }

  lookup_app(id) {
    if (!id) return null;
    return _appSystemApps.get(id) || _appSystemApps.get(String(id).toLowerCase()) || null;
  }
}

export const ActionMode = {
  NONE: 0,
  NORMAL: 1 << 0,
  OVERVIEW: 1 << 1,
  LOCK_SCREEN: 1 << 2,
  UNLOCK_SCREEN: 1 << 3,
  LOGIN_SCREEN: 1 << 4,
  SYSTEM_MODAL: 1 << 5,
  LOOKING_GLASS: 1 << 6,
  POPUP: 1 << 7,
  ALL: 0xff,
};

export default {
  App,
  WindowTracker,
  AppSystem,
  ActionMode,
};
