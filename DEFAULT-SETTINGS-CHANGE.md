# Default plugin settings change

All plugins in `yapper-plugins/` that previously opted into `enabledByDefault` now default to off. The compatibility layer in `renderer-core/025-compat.js` also defaults wrapped plugins to off. This applies to new installs or plugins without a saved preference; it does not force-disable plugins that a user already enabled in their settings.

AutoTranslate is therefore not activated automatically. If manually enabled, it can send message text to Google Translate and, on fallback, MyMemory, as described in the README.

This change only covers files included in this source ZIP. It does not alter built-in plugins/settings in the separate YapCord base application (for example, the base app's MessageLogger setting).
