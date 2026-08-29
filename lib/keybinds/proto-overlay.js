// @ts-check
/**
 * KeybindAdapterWebView overlay (D088). Super-bearing; proto stripSuper.
 * Gnome must not import this.
 */

/** @typedef {{ chord: string, action: string, label: string }} OverlayBind */

/** @type {readonly OverlayBind[]} */
export const PROTO_OVERLAY = Object.freeze([
  Object.freeze({ chord: "<Super>a", action: "launch", label: "Launch (selected)" }),
  Object.freeze({ chord: "<Super>f", action: "flatten", label: "Flatten 1-child CONs" }),
  Object.freeze({ chord: "<Super>q", action: "remove", label: "OpSet remove (with settle)" }),
  Object.freeze({ chord: "Backspace", action: "remove", label: "OpSet remove (with settle)" }),
  Object.freeze({ chord: "Delete", action: "deleteNode", label: "TreeOp destroy node" }),
  Object.freeze({ chord: "<Super>t", action: "toggleTag", label: "Toggle merge tag" }),
  Object.freeze({ chord: "Escape", action: "clearTags", label: "Clear merge tags" }),
]);
