(() => {
  const boosted = new WeakMap();
  let observer;
  const multiplier = () => Math.max(1, Math.min(5, Number(window.YESettings?.volumeBoosterMultiplier) || 2));
  const boost = (media) => { if (!(media instanceof HTMLMediaElement) || media.dataset.yeVolumeBoost === "true") return; try { const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) return; const context = new AudioContextClass(); const source = context.createMediaElementSource(media); const gain = context.createGain(); source.connect(gain).connect(context.destination); boosted.set(media, { context, gain }); media.dataset.yeVolumeBoost = "true"; media.addEventListener("play", () => context.resume().catch(() => {}), { passive: true }); gain.gain.value = multiplier(); } catch (error) { console.debug("[YapCord] volume booster skipped media element", error); } };
  const update = () => { document.querySelectorAll("audio,video").forEach((media) => { const entry = boosted.get(media); if (entry) entry.gain.gain.value = multiplier(); else if (window.YESettings?.volumeBooster) boost(media); }); };
  const apply = (root = document) => { if (!window.YESettings?.volumeBooster) return; root.querySelectorAll?.("audio,video").forEach(boost); update(); if (!observer && document.body) { observer = new MutationObserver(() => update()); observer.observe(document.body, { childList: true, subtree: true }); } };
  window.addEventListener("ye-settings-changed", update);
  registerYEPlugin({ id: "volumeBooster", name: "Volume Booster", description: "Boost rendered audio and video above Yapper's normal volume range.", status: "partial", defaultEnabled: false, apply });
})();
