import { listKits } from "../lib/shared/keybind-presets.js";

const ids = listKits().map((k) => k.id);
console.log(ids.join(" "));
