// Experimental 1.2: voice controls that use Yapper's existing voice actions when available.
(function () {
  const TOOLBAR = 'ym-vb-toolbar';
  const BTN = 'ym-vb-button';

  function clickNative(pattern) {
    const buttons = [...document.querySelectorAll('button,[role="button"]')];
    const button = buttons.find((el) => pattern.test(String(el.getAttribute('aria-label') || el.title || el.textContent || '')));
    if (!button) return false;
    button.click();
    return true;
  }

  function voiceState() {
    const state = YM.Store.getState();
    return state && state.voice && state.voice.channelId ? state.voice : null;
  }

  YM.definePlugin({
    name: 'VoiceButtons',
    description: 'Experimental voice controls: reconnect, disconnect, mute, deafen, and local permission diagnostics.',
    authors: ['YapCord 1.2 experimental'],
    tags: ['Voice', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const h = YM.dom.h;
      const rootSelector = '.voice-bar,.voice-panel,.voice-controls,.voice-header';
      const remove = () => document.querySelectorAll('.' + TOOLBAR).forEach((node) => node.remove());
      const toast = (text, type = 'error') => { try { YM.toast(text, { type }); } catch (_) {} };
      const diagnostic = async () => {
        try {
          const native = await YM.native.app.voiceStatus();
          const devices = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
            ? await navigator.mediaDevices.enumerateDevices()
            : [];
          const mics = devices.filter((d) => d.kind === 'audioinput').length;
          const speakers = devices.filter((d) => d.kind === 'audiooutput').length;
          toast(`Mic: ${native.microphone} · camera: ${native.camera} · ${mics} microphone(s) · ${speakers} speaker(s)`, 'success');
        } catch (err) {
          toast('Voice diagnostics failed: ' + ((err && err.message) || err));
        }
      };
      const reconnect = async () => {
        const v = voiceState();
        const join = YM.finder.lazy(['joinVoice']);
        if (!v || !join()) return toast('No active voice channel was found to reconnect to.');
        try { await join()(v.serverId, v.channelId); toast('Voice reconnect requested.', 'success'); }
        catch (err) { toast('Voice reconnect failed: ' + ((err && err.message) || err)); }
      };
      const render = () => {
        const host = document.querySelector(rootSelector);
        if (!host) { remove(); return; }
        if (host.querySelector('.' + TOOLBAR)) return;
        const bar = h('div', { class: TOOLBAR, role: 'group', 'aria-label': 'YapCord voice controls' },
          h('button', { class: BTN, type: 'button', onClick: reconnect, title: 'Reconnect voice' }, 'Reconnect'),
          h('button', { class: BTN, type: 'button', onClick: () => { if (!clickNative(/\b(un)?mute\b/i)) toast('Mute control was not found.'); }, title: 'Mute microphone' }, 'Mute'),
          h('button', { class: BTN, type: 'button', onClick: () => { if (!clickNative(/\b(un)?deafen\b/i)) toast('Deafen control was not found.'); }, title: 'Deafen audio' }, 'Deafen'),
          h('button', { class: BTN, type: 'button', onClick: () => { if (!clickNative(/disconnect|leave voice|leave call/i)) toast('Disconnect control was not found.'); }, title: 'Disconnect voice' }, 'Disconnect'),
          h('button', { class: BTN, type: 'button', onClick: diagnostic, title: 'Check microphone and camera permissions' }, 'Test devices'));
        host.append(bar);
      };
      ctx.onMutate(render);
      ctx.on('store:change', render);
      ctx.interval(render, 1200);
      ctx.cleanup(remove);
      ctx.css(`.${TOOLBAR}{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0}. ${BTN}{font:inherit}`.replace('. ', '.'));
      render();
    },
  });
})();
