// Compatibility bridge for the non-overlapping YapCord 0.6 plugins.
// The 1.4.1 plugin manager remains authoritative: ported plugins are wrapped as
// normal YM plugins, inherit cleanup/error reporting, and never receive tokens.
(function () {
  const defaults = {
    enabled: true, theme: 'site', accent: '#7c5cff', customCSS: '',
    hideAttachments: true, silentTyping: false, messageLogger: false,
    notificationTweaks: true, notificationSound: true, imageZoom: true,
    quickReply: true, focusMode: false, compactLayout: false, animations: true,
    mentionAvatars: false, petpet: false, volumeBooster: false,
    volumeBoosterMultiplier: 2, copyMessage: true, jumpToLatest: true,
    messageHighlight: true, alwaysShowActions: true, messageContextMenu: true,
    userNotes: false, readAloud: false, mediaActions: true,
    messageBookmarks: true, unreadNavigator: true, mentionHighlight: true,
    notificationRules: false, quickSwitcher: true, roleColors: true,
    statusPresets: false, pluginProfiles: false, messageTranslate: false,
    notificationKeywords: '', customFontOn: false, customFontName: 'Poppins',
    customFontSize: 15, backgroundBlur: 0, backgroundDim: 30,
    backgroundPanelOpacity: 75, backgroundPanelBlur: 10,
  };

    const read = (id) => {
    const key = 'ported.' + id;
    const stored = YM.settings.get(key);
    return stored === undefined ? defaults[id] : stored;
  };
  const snapshot = () => {
    const out = { ...defaults };
    for (const id of Object.keys(defaults)) out[id] = read(id);
    out.enabled = YM.settings.get('ported.enabled', defaults.enabled);
    return out;
  };

  // The old plugins use YESettings as a plain object. A getter keeps it current
  // without duplicating the 1.4.1 settings store.
  Object.defineProperty(window, 'YESettings', {
    configurable: true,
    get: snapshot,
  });
  window.YEDom = window.YEDom || {
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => [...r.querySelectorAll(s)],
    context: (el) => `${el?.className || ''} ${el?.id || ''} ${el?.textContent || ''}`.toLowerCase(),
    isDecorative: () => false,
    messageLike: (el) => !!el?.closest?.('.msg[data-message-id]'),
  };
  window.YEStorage = window.YEStorage || {
    defaults,
    async get() { return snapshot(); },
    async set(patch) {
      for (const [k, v] of Object.entries(patch || {})) YM.settings.set('ported.' + k, v);
      YM.Events.emit('ported:settings');
      return snapshot();
    },
    async reset() {
      for (const [k, v] of Object.entries(defaults)) YM.settings.set('ported.' + k, v);
      YM.Events.emit('ported:settings');
      return snapshot();
    },
  };

  // 0.6 registration is translated to the current plugin contract. Features
  // already implemented natively in 1.4.1 are skipped to avoid duplicate hooks.
  const native = new Set([
    // Native 1.4.1 implementations are better here: structured lifecycle or broader coverage.
    'MessageLogger', 'QuickReply', 'PetPet', 'SilentTyping',
    'Always Show Message Actions', 'Hide Attachments',
  ]);
  // Real categories for the remaining ports (no 'ported' bucket).
  const TAGS = {
    copyMessage: ['Chat', 'Utility'],
    mediaActions: ['Chat', 'Utility'],
    messageContextMenu: ['Chat', 'Utility'],
    pluginProfiles: ['Utility'],
    quickSwitcher: ['Utility'],
    readAloud: ['Chat', 'Utility'],
    statusPresets: ['Status', 'Utility'],
    unreadNavigator: ['Chat', 'Utility'],
    userNotes: ['Utility'],
    volumeBooster: ['Voice', 'Utility'],
  };
  window.registerYEPlugin = (ported) => {
    if (!ported || !ported.id || !ported.apply || native.has(ported.name)) return null;
    const name = ported.name;
    if (YM.plugins.get(name)) return YM.plugins.get(name);
    const plugin = YM.definePlugin({
      name,
      description: ported.description || 'A YapCord plugin.',
      authors: [{ name: 'YapCord' }],
      tags: TAGS[ported.id] || ['Utility'],
      enabledByDefault: false,
      start(ctx) {
        window.__YAPCORD_PORTED_ACTIVE__ = true;
        try { ported.apply(); } catch (err) { ctx.log.error(err); }
        return () => {};
      },
    });
    return plugin;
  };
  window.YEApplyPlugins = () => YM.plugins.startEnabled();
})();
