// Experimental 1.2: route dropped and pasted files through Yapper's existing file input.
(function () {
  const OVERLAY = 'ym-bu-overlay';
  const INPUT = 'ym-bu-input';

  YM.definePlugin({
    name: 'BetterUploadButton',
    description: 'Experimental drag-and-drop and paste uploads using Yapper\'s normal upload pipeline.',
    authors: ['YapCord 1.2 experimental'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const h = YM.dom.h;
      const overlay = h('div', { class: OVERLAY, hidden: true }, 'Drop files to upload');
      const input = h('input', { class: INPUT, type: 'file', multiple: true, hidden: true });
      document.body.append(overlay, input);
      let dragDepth = 0;

      function targetInput() {
        return document.querySelector('input[type="file"]:not(.' + INPUT + '):not([disabled])') || input;
      }
      function setFiles(files) {
        const list = [...(files || [])].filter((file) => file && file.size);
        if (!list.length) return false;
        const target = targetInput();
        const dt = new DataTransfer();
        for (const file of list) dt.items.add(file);
        try {
          target.files = dt.files;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          YM.toast(`Added ${list.length} file${list.length === 1 ? '' : 's'} to the upload queue.`, { type: 'success' });
          return true;
        } catch (err) {
          ctx.log.warn('could not route files to Yapper upload input', err);
          YM.toast('Yapper did not accept the dropped files.', { type: 'error' });
          return false;
        }
      }
      const onDragEnter = (event) => {
        if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
        dragDepth++;
        overlay.hidden = false;
        event.preventDefault();
      };
      const onDragOver = (event) => {
        if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };
      const onDragLeave = (event) => {
        if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) overlay.hidden = true;
      };
      const onDrop = (event) => {
        if (!event.dataTransfer || !event.dataTransfer.files.length) return;
        event.preventDefault();
        dragDepth = 0;
        overlay.hidden = true;
        setFiles(event.dataTransfer.files);
      };
      const onPaste = (event) => {
        const files = [...(event.clipboardData && event.clipboardData.files || [])];
        if (files.length) setFiles(files);
      };
      document.addEventListener('dragenter', onDragEnter, true);
      document.addEventListener('dragover', onDragOver, true);
      document.addEventListener('dragleave', onDragLeave, true);
      document.addEventListener('drop', onDrop, true);
      document.addEventListener('paste', onPaste, true);
      ctx.cleanup(() => {
        document.removeEventListener('dragenter', onDragEnter, true);
        document.removeEventListener('dragover', onDragOver, true);
        document.removeEventListener('dragleave', onDragLeave, true);
        document.removeEventListener('drop', onDrop, true);
        document.removeEventListener('paste', onPaste, true);
        overlay.remove();
        input.remove();
      });
      ctx.css(`.${OVERLAY}{position:fixed;inset:12px;z-index:2147483646;display:grid;place-items:center;border:2px dashed #a779ff;border-radius:16px;background:rgba(30,20,55,.78);color:#eadcff;font-size:20px;font-weight:700;pointer-events:none}.${OVERLAY}[hidden]{display:none}`);
    },
  });
})();
