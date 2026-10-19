// AutoCorrect: fix a small curated list of common English typos as you type.
// Runs only in the chat composer, only when the user enables this plugin, and entirely offline.
(function () {
  const BUILTIN = Object.freeze({
    teh: 'the', hte: 'the', taht: 'that', thta: 'that', adn: 'and', nad: 'and',
    becuase: 'because', becasue: 'because', becouse: 'because', recieve: 'receive',
    recieved: 'received', recieving: 'receiving', beleive: 'believe', wierd: 'weird',
    definately: 'definitely', seperate: 'separate', neccessary: 'necessary',
    occurance: 'occurrence', occurence: 'occurrence', begining: 'beginning',
    goverment: 'government', enviroment: 'environment', freind: 'friend',
    remeber: 'remember', tommorow: 'tomorrow', untill: 'until', thier: 'their',
    wich: 'which', woudl: 'would', woud: 'would', dont: "don't",
    doesnt: "doesn't", didnt: "didn't", cant: "can't", wont: "won't",
    isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
    havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", couldnt: "couldn't",
    wouldnt: "wouldn't", shouldnt: "shouldn't", youre: "you're", theyre: "they're",
    thats: "that's", whats: "what's", theres: "there's", ive: "I've", im: "I'm",
    alot: 'a lot', aswell: 'as well', atleast: 'at least', incase: 'in case',
    eveything: 'everything', somthing: 'something', throught: 'through',
    commited: 'committed', sucess: 'success', succesful: 'successful',
  });

  function fixCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function buildDictionary(custom) {
    const result = new Map(Object.entries(BUILTIN));
    const lines = String(custom || '').split(/[\n,;]+/).slice(0, 100);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length !== 2) continue;
      const from = parts[0].trim().toLowerCase();
      const to = parts[1].trim();
      if (!/^[a-z]{2,30}$/.test(from) || !/^[A-Za-z][A-Za-z' -]{0,39}$/.test(to)) continue;
      result.set(from, to);
    }
    return result;
  }

  function findCorrection(value, caret, dictionary) {
    const left = value.slice(0, caret);
    const match = left.match(/([A-Za-z]{2,})([ \t\r\n.,!?;:)\]])$/);
    if (!match) return null;
    const word = match[1];
    const boundary = match[2];
    const start = caret - word.length - boundary.length;
    const before = left.slice(0, start);
    if (/[A-Za-z0-9_@#]$/.test(before)) return null;
    const beforeLine = before.slice(before.lastIndexOf('\n') + 1);
    const sameLine = beforeLine.slice(Math.max(beforeLine.lastIndexOf(' '), beforeLine.lastIndexOf('\t')) + 1);
    if (/^(?:https?:\/\/|www\.)/i.test(sameLine) || /@[^\s]*$/.test(sameLine)) return null;
    const ticks = (left.slice(left.lastIndexOf('\n') + 1).match(/`/g) || []).length;
    if (ticks % 2) return null;
    const replacement = dictionary.get(word.toLowerCase());
    if (!replacement) return null;
    const fixed = fixCase(word, replacement);
    if (fixed === word) return null;
    return { start, end: start + word.length, fixed };
  }

  YM.definePlugin({
    name: 'AutoCorrect',
    description: 'Correct common English typos in the chat composer as you type. Offline, with optional custom corrections.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    api: { buildDictionary, findCorrection, fixCase },
    options: {
      autoCorrect: {
        type: 'boolean',
        default: true,
        description: 'Automatically correct listed typos when followed by a space or punctuation',
      },
      customCorrections: {
        type: 'string',
        default: '',
        description: 'Optional extra pairs, one per line, in typo=correction format (for example: teh=the)',
      },
    },
    start(ctx) {
      let active = true;
      let dictionary = buildDictionary(ctx.settings.store.customCorrections);
      const pending = new WeakMap();

      function onInput(event) {
        const field = event.target;
        if (!active || event.isComposing || !ctx.settings.store.autoCorrect) return;
        if (!(field instanceof HTMLTextAreaElement) || !field.matches('.composer textarea')) return;
        if (field.disabled || field.readOnly || field.selectionStart !== field.selectionEnd) return;
        const token = (pending.get(field) || 0) + 1;
        pending.set(field, token);
        // Wait until the app's own input handler has observed the user's keystroke.
        Promise.resolve().then(() => {
          if (!active || pending.get(field) !== token || !field.isConnected) return;
          let caret;
          try { caret = field.selectionStart; } catch (_) { return; }
          const correction = findCorrection(field.value, caret, dictionary);
          if (!correction) return;
          try {
            field.setRangeText(correction.fixed, correction.start, correction.end, 'preserve');
            field.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertReplacementText',
              data: correction.fixed,
            }));
          } catch (_) { /* Unsupported input implementation: leave the text unchanged. */ }
        });
      }

      document.addEventListener('input', onInput, true);
      const offSettings = ctx.settings.onChange(() => {
        dictionary = buildDictionary(ctx.settings.store.customCorrections);
      });
      ctx.cleanup(() => {
        active = false;
        document.removeEventListener('input', onInput, true);
        try { offSettings && offSettings(); } catch (_) {}
      });
    },
  });
})();
