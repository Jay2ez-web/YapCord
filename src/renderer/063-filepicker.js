// File picker: Yapper opens the "+" (upload) button's chooser with input.click() on a hidden <input type=file>. Inside the
// app that call is answered by YapCord's own native open dialog instead of Chromium's chooser, so the button works no
// matter how the embedded Chromium treats hidden file inputs. The chosen files are put into the input and "change" is
// fired, exactly like a normal pick (so the upload pipeline and Yapper's own checks run as usual).
// Switch: App page -> "Use YapCord's file dialog" (window.ownFilePicker). Not used inside the official Yapper app: it has its own
// working chooser, so there the click is left alone.

const FilePicker = (YM.filePicker = { busy: false, picks: 0, failures: 0 });
const nativeClick = HTMLInputElement.prototype.click;

function enabled() {
  return YM.inApp && !YM.official && YM.native && YM.native.files && typeof YM.native.files.pick === 'function' && YM.settings.get('window.ownFilePicker', true) !== false;
}

function toast(text) {
  try {
    if (YM.toast) YM.toast(text, { type: 'error' });
  } catch (_) {}
}

async function pick(input, nativeArgs) {
  FilePicker.busy = true;
  try {
    const multiple = !!input.multiple;
    const picked = await YM.native.files.pick({ accept: input.accept || '', multiple });
    if (!picked || !picked.length) return; // cancelled
    const files = [];
    for (const f of picked) {
      if (f.error === 'too-large') {
        toast(f.name + ' is too large to send (over 500 MB).');
        continue;
      }
      if (f.error || !f.data) {
        toast('Could not read ' + f.name + '.');
        continue;
      }
      files.push(new File([f.data], f.name, { type: f.type || '', lastModified: f.lastModified || Date.now() }));
    }
    if (!files.length) return;
    const dt = new DataTransfer();
    for (const f of multiple ? files : files.slice(0, 1)) dt.items.add(f);
    input.files = dt.files;
    FilePicker.picks++;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (err) {
    FilePicker.failures++;
    YM.log.error('own file dialog failed, falling back to the browser chooser', err);
    try {
      nativeClick.apply(input, nativeArgs);
    } catch (_) {}
  } finally {
    FilePicker.busy = false;
  }
}

HTMLInputElement.prototype.click = function click() {
  if (this.type !== 'file' || this.disabled || this.webkitdirectory || !enabled()) return nativeClick.apply(this, arguments);
  if (FilePicker.busy) return undefined; // a dialog is already open
  pick(this, arguments);
  return undefined;
};
