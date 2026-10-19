(() => {
  let hoveredMessage = null;
  const selector = "div.msg[data-message-id]";
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); } };
  const apply = () => {
    if (!window.YESettings?.copyMessage || window.__YE_COPY_MESSAGE__) return;
    window.__YE_COPY_MESSAGE__ = true;
    document.addEventListener("pointerover", (event) => { const message = event.target.closest?.(selector); if (message) hoveredMessage = message; }, true);
    document.addEventListener("pointerout", (event) => { if (hoveredMessage && !hoveredMessage.contains(event.relatedTarget)) hoveredMessage = null; }, true);
    document.addEventListener("keydown", async (event) => { if (!window.YESettings?.copyMessage || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "c" || !hoveredMessage) return; const text = hoveredMessage.querySelector(".msg-text")?.innerText?.trim() || hoveredMessage.innerText.trim(); if (!text) return; event.preventDefault(); await copy(text); hoveredMessage.dataset.yeCopied = "true"; setTimeout(() => delete hoveredMessage.dataset.yeCopied, 700); }, true);
  };
  registerYEPlugin({ id: "copyMessage", name: "Copy Hovered Message", description: "Press Ctrl/Cmd+Shift+C while over a message to copy its text.", status: "working", defaultEnabled: true, apply });
})();
