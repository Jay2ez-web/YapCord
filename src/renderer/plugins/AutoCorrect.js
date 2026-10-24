// AutoCorrect uses a bundled local English dictionary and deterministic grammar rules.
// No network calls. An explicit user-off choice is preserved; unset installs enable it by default.
(function () {

  // Make sure autocorrect is active for new installs and for existing users who never chose a state.
  // Preserve an explicit false set by the user.
  if (YM.settings && typeof YM.settings.get === 'function' && typeof YM.settings.set === 'function') {
    if (YM.settings.get('plugins.AutoCorrect.enabled') === undefined) {
      YM.settings.set('plugins.AutoCorrect.enabled', true);
    }
  }

  function fixCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function editDistance(left, right) {
    if (Math.abs(left.length - right.length) > 2) return 3;
    const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i++) table[i][0] = i;
    for (let j = 0; j <= right.length; j++) table[0][j] = j;
    for (let i = 1; i <= left.length; i++) {
      for (let j = 1; j <= right.length; j++) {
        const substitution = table[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
        table[i][j] = Math.min(table[i][j - 1] + 1, table[i - 1][j] + 1, substitution);
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
          table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
        }
      }
    }
    return table[left.length][right.length];
  }

  function spellingSuggestion(word, spellchecker, sentenceStart) {
    if (!spellchecker || typeof spellchecker.correct !== 'function' || typeof spellchecker.suggest !== 'function') return null;
    if (!/^[A-Za-z]{3,24}$/.test(word) || word === word.toUpperCase()) return null;
    if (word[0] !== word[0].toLowerCase() && !sentenceStart) return null;
    const lower = word.toLowerCase();
    try {
      if (spellchecker.correct(lower)) return null;
      const suggestions = spellchecker.suggest(lower).filter((suggestion) => /^[a-z]{2,24}$/.test(suggestion)).slice(0, 12);
      if (!suggestions.length) return null;
      const scored = suggestions.map((suggestion) => ({ suggestion, distance: editDistance(lower, suggestion) }));
      const best = Math.min(...scored.map((item) => item.distance));
      const ties = scored.filter((item) => item.distance === best);
      const maximumDistance = lower.length >= 10 ? 3 : lower.length >= 7 ? 2 : 1;
      if (best < 1 || best > maximumDistance || ties.length !== 1) return null;
      return ties[0].suggestion;
    } catch (_) {
      return null;
    }
  }

  function findCorrection(value, caret, spellchecker) {
    if (typeof value !== 'string' || !Number.isInteger(caret) || caret < 0 || caret > value.length) return null;
    const left = value.slice(0, caret);
    // Periods are corrected only after a following space/newline, avoiding domains such as example.com.
    // Other sentence punctuation can be corrected immediately or when followed by whitespace.
    const match = left.match(/([A-Za-z]+(?:['’][A-Za-z]+)?)([.,!?;:)\]]{0,3}[ \t\r\n]+|[!?,;:)\]])$/);
    if (!match) return null;
    const word = match[1];
    const suffix = match[2];
    const start = caret - word.length - suffix.length;
    const before = left.slice(0, start);
    if (/[A-Za-z0-9_@#\p{L}]$/u.test(before)) return null;

    const beforeLine = before.slice(before.lastIndexOf('\n') + 1);
    const sameLine = beforeLine.slice(Math.max(beforeLine.lastIndexOf(' '), beforeLine.lastIndexOf('\t')) + 1);
    if (/^(?:https?:\/\/|www\.)/i.test(sameLine) || /@[\S]*$/.test(sameLine) || /[A-Za-z0-9-]+\.$/.test(sameLine)) return null;

    const fenceCount = (left.match(/```/g) || []).length;
    const lineTicks = (left.slice(left.lastIndexOf('\n') + 1).match(/`/g) || []).length;
    if (fenceCount % 2 || lineTicks % 2) return null;

    const lower = word.toLowerCase();

    const sentenceStart = !before.trim() || /[.!?]$/.test(before.trimEnd());
    if (lower === 'i') return { start, end: start + word.length, fixed: 'I' };

    // High-confidence grammar fixes: repeated words, a/an before the next word, and
    // common "could of"/"would of"/"should of" constructions.
    const repeated = before.match(/([A-Za-z]{2,})[ \t]+$/);
    if (repeated && repeated[1].toLowerCase() === lower) {
      return { start: start - repeated[0].length, end: start + word.length, fixed: fixCase(word, lower) };
    }
    const article = before.match(/\b(a|an)[ \t]+$/i);
    if (article && /^[A-Za-z]/.test(word)) {
      const next = lower;
      const vowelSound = (/^[aeiou]/.test(next) || /^(?:heir|honest|honor|honour|hour|herb)(?:\b|$)/.test(next))
        && !/^(?:one|once|ewe|euro|uni(?:[^n]|$)|use|user|usual|utensil|ukulele|ubiquitous)/.test(next);
      const desired = vowelSound ? 'an' : 'a';
      if (article[1].toLowerCase() !== desired) {
        const articleStart = start - article[0].length;
        return { start: articleStart, end: start + word.length, fixed: fixCase(article[1], desired) + ' ' + word };
      }
    }
    if (lower === 'welcome' && /\byour[ \t]+$/i.test(before)) {
      const previous = before.match(/your[ \t]+$/i)[0];
      const desired = fixCase(previous.trim(), "you're");
      return { start: start - previous.length, end: start + word.length, fixed: desired + ' ' + word };
    }
    if (lower === 'of') {
      const phrase = before.match(/\b(could|would|should)[ \t]+$/i);
      if (phrase) {
        const wordCase = fixCase(phrase[1], phrase[1].toLowerCase() + "'ve");
        return { start: start - phrase[0].length, end: start + word.length, fixed: wordCase };
      }
    }

    const suggestion = spellingSuggestion(word, spellchecker, sentenceStart);
    if (!suggestion) return null;
    const fixed = fixCase(word, suggestion);
    if (fixed.toLowerCase() === word.toLowerCase()) return null;
    return { start, end: start + word.length, fixed };
  }

  YM.definePlugin({
    name: 'AutoCorrect',
    description: 'Correct spelling locally with a built-in English dictionary and a few conservative grammar fixes. Press Ctrl/Cmd+Z immediately to undo a replacement; no text leaves your device.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: true,
    api: { findCorrection, fixCase, editDistance, spellingSuggestion },
    options: {
      autoCorrect: {
        type: 'boolean',
        default: true,
        description: 'Automatically correct spelling and safe grammar mistakes offline; Ctrl/Cmd+Z immediately undoes the last untouched fix',
      },
    },
    start(ctx) {
      let active = true;
      let spellchecker = null;
      let spellcheckerAttempted = false;
      const pending = new WeakMap();
      const lastCorrection = new WeakMap();
      const allowedInputTypes = new Set(['insertText', 'insertLineBreak', 'insertParagraph']);

      function getSpellchecker() {
        if (spellchecker || spellcheckerAttempted) return spellchecker;
        spellcheckerAttempted = true;
        try {
          const engine = typeof window !== 'undefined' && window.YapCordSpellchecker;
          if (engine && typeof engine.create === 'function') spellchecker = engine.create();
        } catch (_) { /* Exact built-in rules remain available if the local dictionary fails to load. */ }
        return spellchecker;
      }

      function onInput(event) {
        const field = event.target;
        if (event.inputType !== 'insertReplacementText' && field && typeof field === 'object') lastCorrection.delete(field);
        if (!active || event.isComposing || !ctx.settings.store.autoCorrect) return;
        if (event.inputType && !allowedInputTypes.has(event.inputType)) return;
        if (!(field instanceof HTMLTextAreaElement) || !field.matches('.composer textarea')) return;
        if (field.disabled || field.readOnly || field.selectionStart !== field.selectionEnd) return;
        const token = (pending.get(field) || 0) + 1;
        pending.set(field, token);
        // Let Yapper process the user's original keystroke first, then send one normal input event for the replacement.
        Promise.resolve().then(() => {
          if (!active || pending.get(field) !== token || !field.isConnected) return;
          let caret;
          try { caret = field.selectionStart; } catch (_) { return; }
          const correction = findCorrection(field.value, caret, getSpellchecker());
          if (!correction) return;
          try {
            const previousValue = field.value;
            const previousStart = field.selectionStart;
            const previousEnd = field.selectionEnd;
            field.setRangeText(correction.fixed, correction.start, correction.end, 'preserve');
            lastCorrection.set(field, {
              previousValue,
              previousStart,
              previousEnd,
              correctedValue: field.value,
              correctedStart: field.selectionStart,
              correctedEnd: field.selectionEnd,
              timestamp: Date.now(),
            });
            let replacementEvent;
            try {
              replacementEvent = new InputEvent('input', {
                bubbles: true,
                inputType: 'insertReplacementText',
                data: correction.fixed,
              });
            } catch (_) {
              replacementEvent = new Event('input', { bubbles: true });
            }
            field.dispatchEvent(replacementEvent);
          } catch (_) { /* Unsupported input implementation: leave normal typing untouched. */ }
        });
      }

      function onKeyDown(event) {
        if (!active || event.key.toLowerCase() !== 'z' || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
        const field = event.target;
        if (!(field instanceof HTMLTextAreaElement) || !field.matches('.composer textarea')) return;
        const previous = lastCorrection.get(field);
        if (!previous || Date.now() - previous.timestamp > 8000 || field.value !== previous.correctedValue
          || field.selectionStart !== previous.correctedStart || field.selectionEnd !== previous.correctedEnd) return;
        event.preventDefault();
        lastCorrection.delete(field);
        pending.set(field, (pending.get(field) || 0) + 1);
        try {
          field.value = previous.previousValue;
          field.setSelectionRange(previous.previousStart, previous.previousEnd);
          let undoEvent;
          try {
            undoEvent = new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: null });
          } catch (_) {
            undoEvent = new Event('input', { bubbles: true });
          }
          field.dispatchEvent(undoEvent);
        } catch (_) { /* Unsupported input implementation: let the native undo proceed. */ }
      }

      document.addEventListener('input', onInput, true);
      document.addEventListener('keydown', onKeyDown, true);
      ctx.cleanup(() => {
        active = false;
        document.removeEventListener('input', onInput, true);
        document.removeEventListener('keydown', onKeyDown, true);
      });
    },
  });
})();
