// Mock St (Shell Toolkit) namespace
import { withSignals } from "../helpers/signalMixin.js";

export class Widget extends withSignals() {
  constructor(params = {}) {
    super();
    this.name = params.name || "";
    this.style_class = params.style_class || "";
    this.visible = params.visible !== false;
    this.reactive = params.reactive !== undefined ? params.reactive : true;
    this.clip_to_allocation =
      params.clip_to_allocation !== undefined ? params.clip_to_allocation : true;
    this.children = [];
    this.x = params.x || 0;
    this.y = params.y || 0;
    this.width = params.width || 0;
    this.height = params.height || 0;
    this._flags = 0;
  }

  set_flags(flags) {
    this._flags = flags;
  }

  get_flags() {
    return this._flags;
  }

  get_style_class_name() {
    return this.style_class;
  }

  set_style_class_name(name) {
    this.style_class = name;
  }

  add_style_class_name(name) {
    if (!this.style_class.includes(name)) {
      this.style_class += ` ${name}`;
    }
  }

  remove_style_class_name(name) {
    this.style_class = this.style_class.replace(name, "").trim();
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  destroy() {
    // Mock destroy
  }

  grab_key_focus() {
    // Mock: actor-level key focus is a no-op in tests
  }

  remove_all_transitions() {
    // Mock: no in-flight Clutter transitions to cancel in tests
  }

  get_parent() {
    return this._parent || null;
  }

  add_child(child) {
    if (!child) return;
    if (!this.children.includes(child)) this.children.push(child);
    child._parent = this;
  }

  remove_child(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    if (child && child._parent === this) child._parent = null;
  }

  get_children() {
    return this.children;
  }

  contains(child) {
    return this.children.includes(child);
  }

  // St.Widget theme-node accessor. Tests don't compute real CSS, so return a stub
  // whose metrics are all zero (the decoration code reads border widths off it).
  get_theme_node() {
    return {
      get_border_width: () => 0,
      get_padding: () => 0,
    };
  }

  set_size(width, height) {
    this.width = width;
    this.height = height;
  }

  set_height(height) {
    this.height = height;
  }

  set_width(width) {
    this.width = width;
  }

  set_position(x, y) {
    this.x = x;
    this.y = y;
  }

  // Clutter.Actor preferred-size queries: return [min, natural].
  get_preferred_width(_forHeight) {
    return [0, this.width || 0];
  }

  get_preferred_height(_forWidth) {
    return [0, this.height || 0];
  }

  // Clutter.Actor.ease: apply final values immediately and run onComplete
  // synchronously unless a test overrides this to control timing.
  ease(params = {}) {
    for (const [key, value] of Object.entries(params)) {
      if (key === "duration" || key === "mode" || key === "onComplete") continue;
      this[key] = value;
    }
    if (typeof params.onComplete === "function") params.onComplete();
  }
}

export class Bin extends Widget {
  constructor(params = {}) {
    super(params);
    this.child = params.child || null;
    this.children = [];
  }

  set_child(child) {
    this.child = child;
  }

  get_child() {
    return this.child;
  }

  add_child(child) {
    this.children.push(child);
  }

  remove_child(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }

  get_children() {
    return this.children;
  }

  get_child_at_index(index) {
    return this.children[index] || null;
  }

  contains(child) {
    return this.children.includes(child);
  }
}

export class BoxLayout extends Widget {
  constructor(params = {}) {
    super(params);
    this.children = [];
    // Dual API: GNOME 45–47 use `.vertical`; GNOME 48+ use `.orientation`.
    // Keep both in sync so Compat.setBoxOrientation branches and direct tests work.
    const fromParams =
      params.orientation !== undefined ? params.orientation : params.vertical ? 1 : 0;
    this._orientation = fromParams ?? 0;
  }

  get orientation() {
    return this._orientation;
  }

  set orientation(value) {
    this._orientation = value;
  }

  get vertical() {
    return this._orientation === 1;
  }

  set vertical(value) {
    this._orientation = value ? 1 : 0;
  }

  add_child(child) {
    if (!child) return;
    if (!this.children.includes(child)) this.children.push(child);
    child._parent = this;
  }

  remove_child(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
    if (child && child._parent === this) child._parent = null;
  }

  get_children() {
    return this.children;
  }

  get_child_at_index(index) {
    return this.children[index] || null;
  }

  contains(child) {
    return this.children.includes(child);
  }

  destroy_all_children() {
    // Mirror Clutter: destroy and detach every child.
    const kids = this.children.splice(0);
    kids.forEach((c) => {
      if (c && c._parent === this) c._parent = null;
      c.destroy && c.destroy();
    });
  }
}

export class Label extends Widget {
  constructor(params = {}) {
    super(params);
    this.text = params.text || "";
  }

  get_text() {
    return this.text;
  }

  set_text(text) {
    this.text = text;
  }
}

export class Button extends Widget {
  constructor(params = {}) {
    super(params);
    this.label = params.label || "";
  }
}

// Module-level scale factor so tests can simulate HiDPI. get_for_stage returns a
// fresh instance per call, so the getter must read this shared var (not a field).
let _scaleFactor = 1;
export function __setScaleFactor(value) {
  _scaleFactor = value;
}
export function __resetScaleFactor() {
  _scaleFactor = 1;
}

export class ThemeContext {
  static get_for_stage(stage) {
    return new ThemeContext();
  }

  get_theme() {
    return {
      load_stylesheet: () => {},
      unload_stylesheet: () => {},
    };
  }

  get scale_factor() {
    return _scaleFactor;
  }
}

export class Icon extends Widget {
  constructor(params = {}) {
    super(params);
    this.gicon = params.gicon || null;
    this.icon_name = params.icon_name || "";
    this.icon_size = params.icon_size || 16;
  }
}

export const Side = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };

export default {
  Widget,
  Bin,
  BoxLayout,
  Label,
  Button,
  ThemeContext,
  Icon,
  Side,
  __setScaleFactor,
  __resetScaleFactor,
};
