// ScreenShareQuality: makes the video sender deliver what Yapper captured.
//
// Yapper decides the capture size and frame rate itself, per account and per version (it changes them now and then). But its
// video SDK is created without publish settings, so the sender can end up limited to the SDK's default of 15 fps / 3 Mbps
// whatever Yapper captured. This plugin reads the real size and frame rate of the captured screen track and raises the sender
// limits to match (frame rate as captured, a bitrate that fits that size and speed), and lets you choose between sharp text
// and smooth motion.
// It does NOT change the capture itself and never asks for more than Yapper captured: what your account gets (720p, 1080p, 30,
// 60 fps ...) stays Yapper's decision. It also never lowers a limit that is already higher.
(function () {
  const MIN_BITRATE = 2500000;
  const MAX_BITRATE = 100000000;
  const BITS_PER_PIXEL = 0.06; // bits per pixel per frame, a normal value for screen content

  function sizeOf(track) {
    let s = {};
    try { s = track.getSettings(); } catch (_) { /* ignore */ }
    return { w: s.width || 0, h: s.height || 0, fps: s.frameRate || 0 };
  }

  /** Limits that fit what was captured: { fps, bitrate } (null when the track says nothing about its size and speed). */
  function limitsFor(track, bitrateCap = MAX_BITRATE) {
    const { w, h, fps } = sizeOf(track);
    if (!w || !h) return null;
    const rate = fps >= 1 ? Math.round(fps) : 30; // an unknown frame rate counts as 30
    const bitrate = Math.min(Math.max(MIN_BITRATE, Number(bitrateCap) || MAX_BITRATE), Math.max(MIN_BITRATE, Math.round(w * h * rate * BITS_PER_PIXEL)));
    return { fps: rate, bitrate };
  }

  /** Raises an encoding's limits to `limits`. Never lowers a limit that is already higher. */
  function adjustEncoding(enc, limits) {
    const out = { ...(enc || {}) };
    out.maxFramerate = Math.max(Number(out.maxFramerate) || 0, limits.fps);
    out.maxBitrate = Math.max(Number(out.maxBitrate) || 0, limits.bitrate);
    return out;
  }

  function isScreenTrack(track, source) {
    if (!track || track.kind !== 'video') return false;
    let s = {};
    try { s = track.getSettings(); } catch (_) { /* ignore */ }
    if (s.displaySurface) return true; // real getDisplayMedia track
    return source === 'hint' && /^(detail|motion|text)$/.test(track.contentHint || '');
  }

  const stats = { touched: 0 };

  YM.definePlugin({
    name: 'ScreenShareQuality',
    description: 'Requests a higher screen-share capture target and raises the sender limits to match what your PC, browser, and Yapper actually provide. The platform can still cap the result.',
    authors: ['YapCord'],
    tags: ['Voice', 'Utility'],
    api: { adjustEncoding, limitsFor, isScreenTrack, stats },
    options: {
      raiseFramerate: { type: 'boolean', default: true, description: 'Let the sender use the captured frame rate and a fitting bitrate (the video SDK may otherwise cap you at 15 fps / 3 Mbps)' },
      contentHint: {
        type: 'select', default: 'detail', description: 'Optimise for',
        options: [
          { label: 'Sharp text and images (Yapper default)', value: 'detail' },
          { label: 'Smooth motion (games and video)', value: 'motion' },
        ],
      },
      captureWidth: { type: 'number', default: 1920, min: 640, max: 7680, step: 1, description: 'Requested capture width in pixels (ideal, not guaranteed)' },
      captureHeight: { type: 'number', default: 1080, min: 360, max: 4320, step: 1, description: 'Requested capture height in pixels (ideal, not guaranteed)' },
      captureFps: { type: 'number', default: 60, min: 15, max: 120, step: 1, description: 'Requested capture frame rate (ideal, not guaranteed)' },
      maxBitrateMbps: { type: 'number', default: 50, min: 3, max: 100, step: 1, description: 'Maximum sender bitrate in Mbps (the service may cap this)' },
    },
    start(ctx) {
      const pcProto = window.RTCPeerConnection && RTCPeerConnection.prototype;
      const senderProto = window.RTCRtpSender && RTCRtpSender.prototype;
      if (!pcProto || typeof pcProto.addTransceiver !== 'function') return;
      const media = navigator.mediaDevices;
      const origGetDisplayMedia = media && media.getDisplayMedia;
      let wrappedGetDisplayMedia = null;
      if (media && typeof origGetDisplayMedia === 'function') {
        wrappedGetDisplayMedia = async function (constraints = {}) {
          const s = ctx.settings.store;
          const width = Math.max(640, Number(s.captureWidth) || 1920);
          const height = Math.max(360, Number(s.captureHeight) || 1080);
          const fps = Math.max(15, Number(s.captureFps) || 60);
          const requested = { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps, max: fps } };
          const next = { ...constraints, video: constraints.video === false ? requested : { ...(constraints.video && typeof constraints.video === 'object' ? constraints.video : {}), ...requested } };
          const stream = await origGetDisplayMedia.call(this, next);
          const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
          if (track && typeof track.applyConstraints === 'function') {
            await track.applyConstraints(requested).catch(() => undefined);
          }
          return stream;
        };
        media.getDisplayMedia = wrappedGetDisplayMedia;
      }
      const origAdd = pcProto.addTransceiver;

      const wrapAdd = function (trackOrKind, init) {
        try {
          const track = trackOrKind && typeof trackOrKind === 'object' ? trackOrKind : null;
          const limits = isScreenTrack(track, 'hint') ? limitsFor(track, (Number(ctx.settings.store.maxBitrateMbps) || 50) * 1000000) : null;
          if (limits) {
            const s = ctx.settings.store;
            if (s.contentHint === 'motion' || s.contentHint === 'detail') track.contentHint = s.contentHint;
            if (s.raiseFramerate) {
              const encs = init && Array.isArray(init.sendEncodings) && init.sendEncodings.length ? init.sendEncodings : [{}];
              init = { ...(init || {}), sendEncodings: encs.map((e) => adjustEncoding(e, limits)) };
            }
            stats.touched++;
          }
        } catch (err) {
          YM.log.error('ScreenShareQuality hook failed', err);
        }
        return origAdd.call(this, trackOrKind, init);
      };
      pcProto.addTransceiver = wrapAdd;

      // The SDK also adjusts senders later (adaptive streaming); keep the tier's limits there too.
      let origSet = null;
      let wrapSet = null;
      if (senderProto && typeof senderProto.setParameters === 'function') {
        origSet = senderProto.setParameters;
        wrapSet = function (params) {
          try {
            const track = this.track;
            const limits = ctx.settings.store.raiseFramerate && isScreenTrack(track, 'hint') ? limitsFor(track, (Number(ctx.settings.store.maxBitrateMbps) || 50) * 1000000) : null;
            if (limits && params && Array.isArray(params.encodings) && params.encodings.length) {
              params.encodings = params.encodings.map((e) => ({ ...adjustEncoding(e, limits), active: e.active, rid: e.rid, scaleResolutionDownBy: e.scaleResolutionDownBy }));
              params.encodings.forEach((e) => { for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k]; });
            }
          } catch (err) {
            YM.log.error('ScreenShareQuality sender hook failed', err);
          }
          return origSet.call(this, params);
        };
        senderProto.setParameters = wrapSet;
      }

      ctx.cleanup(() => {
        if (wrappedGetDisplayMedia && media.getDisplayMedia === wrappedGetDisplayMedia) media.getDisplayMedia = origGetDisplayMedia;
        if (pcProto.addTransceiver === wrapAdd) pcProto.addTransceiver = origAdd;
        if (wrapSet && senderProto.setParameters === wrapSet) senderProto.setParameters = origSet;
      });
    },
  });
})();
