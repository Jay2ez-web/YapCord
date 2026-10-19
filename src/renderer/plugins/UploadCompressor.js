// UploadCompressor: makes attachments fit under the configured Yapper file size limit before they are uploaded.
// Images are re-encoded as WebP (also fixes formats Yapper refuses, like BMP/AVIF). Videos are re-encoded in real time
// (a 2 minute clip takes about 2 minutes) as WebM. Other files and animated GIFs are left alone.
(function () {
  const MB = 1048576;
  const IMAGE_OK = /^image\/(png|jpe?g|webp|bmp|avif|x-ms-bmp|tiff?)$/i;

  function extOf(name) {
    const m = /(\.tar)?\.[A-Za-z0-9]{1,8}$/.exec(name);
    return m ? m[0] : '';
  }
  function withExt(name, ext) {
    const e = extOf(name);
    return (e ? name.slice(0, -e.length) : name) + ext;
  }
  const fmt = (bytes) => (bytes / MB).toFixed(bytes < 10 * MB ? 2 : 1) + ' MB';

  async function toBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  /** Re-encode an image as WebP until it is <= targetBytes. Returns a File, or null if it cannot be done. */
  async function compressImage(file, targetBytes, { maxDim = 4096 } = {}) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (_) {
      return null;
    }
    try {
      let dim = Math.min(maxDim, Math.max(bitmap.width, bitmap.height));
      let quality = 0.9;
      for (let i = 0; i < 14; i++) {
        const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        const blob = await toBlob(canvas, 'image/webp', quality);
        if (blob && blob.type === 'image/webp' && blob.size <= targetBytes) {
          return new File([blob], withExt(file.name, '.webp'), { type: 'image/webp', lastModified: file.lastModified });
        }
        if (quality > 0.55) quality -= 0.12;
        else dim = Math.round(dim * 0.78);
        if (dim < 240) break;
      }
      return null;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  function pickMime() {
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
  }

  function videoPlan(duration, width, height, targetBytes) {
    const audioBps = 64000;
    const totalBps = (targetBytes * 8 * 0.9) / duration; // ~10% slack for container + rate control overshoot
    const videoBps = Math.max(0, totalBps - audioBps);
    if (videoBps < 120000) return null;
    // ~0.08 bits per pixel per frame at 30 fps is a decent picture for VP8/VP9
    const maxPixels = videoBps / (0.08 * 30);
    const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
    let w = Math.max(2, Math.round((width * scale) / 2) * 2);
    let h = Math.max(2, Math.round((height * scale) / 2) * 2);
    return { videoBps: Math.round(videoBps), audioBps, width: w, height: h };
  }

  /** Re-encode a video in real time. Returns a File (webm) or null. */
  async function compressVideo(file, targetBytes, { maxSeconds = 600, progress, attempt = 1, scale = 1 } = {}) {
    const mime = pickMime();
    if (!mime) return null;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.src = url;
    let ac = null;
    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('cannot read video'));
      });
      if (video.duration === Infinity) {
        // WebM files made by MediaRecorder have no duration until the end has been seeked to.
        await new Promise((resolve) => {
          video.ontimeupdate = () => { if (Number.isFinite(video.duration)) { video.ontimeupdate = null; resolve(); } };
          video.currentTime = 1e101;
          setTimeout(resolve, 4000);
        });
        video.currentTime = 0;
        await new Promise((resolve) => { video.onseeked = resolve; setTimeout(resolve, 1000); });
      }
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return null;
      if (duration > maxSeconds) return { tooLong: true, duration };
      const plan = videoPlan(duration, video.videoWidth || 1280, video.videoHeight || 720, targetBytes * scale);
      if (!plan) return { tooLong: true, duration };

      const canvas = document.createElement('canvas');
      canvas.width = plan.width;
      canvas.height = plan.height;
      const ctx = canvas.getContext('2d');
      const draw = () => ctx.drawImage(video, 0, 0, plan.width, plan.height);
      const stream = canvas.captureStream(30);
      // Audio goes to a recorder only (never to the speakers).
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaElementSource(video);
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        if (ac.state === 'suspended') await ac.resume().catch(() => undefined);
      } catch (_) {
        // No audio track is better than no video. But then the element must not play out loud through the speakers.
        video.muted = true;
      }

      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: plan.videoBps, audioBitsPerSecond: plan.audioBps });
      const chunks = [];
      recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      const finished = new Promise((resolve) => (recorder.onstop = resolve));

      let stop = false;
      const tick = () => {
        if (stop) return;
        draw();
        if (progress) progress(video.currentTime / duration);
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };

      recorder.start(1000);
      await video.play();
      tick();
      await new Promise((resolve) => {
        video.onended = resolve;
        video.onpause = () => { if (video.ended) resolve(); };
        const watchdog = setInterval(() => {
          if (progress && progress.cancelled) { clearInterval(watchdog); resolve(); }
          if (video.ended) { clearInterval(watchdog); resolve(); }
        }, 400);
      });
      stop = true;
      draw();
      if (recorder.state !== 'inactive') recorder.stop();
      await finished;
      stream.getTracks().forEach((t) => t.stop());
      if (progress && progress.cancelled) return null;

      const blob = new Blob(chunks, { type: 'video/webm' });
      if (blob.size <= targetBytes) {
        return new File([blob], withExt(file.name, '.webm'), { type: 'video/webm', lastModified: file.lastModified });
      }
      YM.log.warn('video re-encode too big: ' + blob.size + ' > ' + Math.round(targetBytes) + ' bytes (attempt ' + attempt + ', plan ' + JSON.stringify(plan) + ')');
      // Rate control overshoots on busy footage. Retry with a budget scaled by how far off we were; short clips only,
      // because every attempt plays the whole video again.
      const maxAttempts = duration <= 120 ? 3 : duration <= 300 ? 2 : 1;
      if (attempt < maxAttempts && !(progress && progress.cancelled)) {
        URL.revokeObjectURL(url);
        return compressVideo(file, targetBytes, { maxSeconds, progress, attempt: attempt + 1, scale: Math.max(0.1, scale * (targetBytes / blob.size) * 0.85) });
      }
      return null;
    } catch (err) {
      YM.log.error('video compression failed', err);
      return null;
    } finally {
      try { video.pause(); } catch (_) { /* ignore */ }
      if (ac) ac.close().catch(() => undefined);
      URL.revokeObjectURL(url);
    }
  }

  YM.definePlugin({
    name: 'UploadCompressor',
    description: "Shrinks images and videos to fit the limit you enter before they are sent. This cannot bypass a server-side upload limit: if Yapper rejects files above 10 MB for your account, set this to 10 MB.",
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    api: { compressImage, compressVideo, videoPlan, withExt },
    options: {
      limitMB: { type: 'number', default: 10, min: 1, max: 125, step: 1, description: 'Target upload limit in MB. Use 125 only if Yapper accepts files that large for your account.' },
      images: { type: 'boolean', default: true, description: 'Convert images that are too large (or in a format Yapper refuses, like BMP or AVIF) to WebP' },
      videos: { type: 'boolean', default: true, description: 'Re-encode videos that are too large (plays in real time, with a Skip button)' },
      maxVideoMinutes: { type: 'number', default: 10, description: 'Do not try videos longer than this many minutes' },
    },
    start(ctx) {
      const s = () => ctx.settings.store;
      ctx.cleanup(
        YM.uploads.addFilter(
          async (files) => {
            const limit = Math.max(0.1, Number(s().limitMB) || 10) * MB;
            const target = Math.floor(limit * 0.95);
            const out = [];
            for (const f of files) {
              const isVideo = /^video\//i.test(f.type);
              const needsConvert = IMAGE_OK.test(f.type) && !/^image\/(png|jpe?g|webp)$/i.test(f.type);
              if (f.type === 'image/gif' && f.size > limit) {
                YM.toast(f.name + ' is ' + fmt(f.size) + ' and animated GIFs cannot be shrunk here. Convert it to a video first.', { type: 'error', duration: 6000 });
                out.push(f);
              } else if (s().images && IMAGE_OK.test(f.type) && (f.size > limit || needsConvert)) {
                const r = await compressImage(f, target);
                if (r) {
                  YM.toast(f.name + ': ' + fmt(f.size) + ' -> ' + fmt(r.size), { type: 'success' });
                  out.push(r);
                } else {
                  YM.toast('Could not shrink ' + f.name + ' enough.', { type: 'error' });
                  out.push(f);
                }
              } else if (s().videos && isVideo && f.size > limit) {
                const p = YM.uploads.progress('Compressing ' + f.name + ' (0%)');
                const cb = (x) => p.update('Compressing ' + f.name + ' (' + Math.round(x * 100) + '%)');
                Object.defineProperty(cb, 'cancelled', { get: () => p.cancelled });
                const r = await compressVideo(f, target, { maxSeconds: Math.max(5, Number(s().maxVideoMinutes) || 10) * 60, progress: cb });
                p.done();
                if (r && r.tooLong) {
                  YM.toast(f.name + ' is too long to fit in ' + fmt(limit) + '. Trim it first.', { type: 'error', duration: 6000 });
                  out.push(f);
                } else if (r) {
                  YM.toast(f.name + ': ' + fmt(f.size) + ' -> ' + fmt(r.size), { type: 'success' });
                  out.push(r);
                } else {
                  if (!p.cancelled) YM.toast('Could not compress ' + f.name + ' enough.', { type: 'error' });
                  out.push(f);
                }
              } else {
                out.push(f);
              }
            }
            return out;
          },
          { order: 10, name: 'UploadCompressor' },
        ),
      );
    },
  });
})();
