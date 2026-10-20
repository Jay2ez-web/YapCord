// AutoCorrect: locally replace common English typos at word boundaries while typing.
// No network calls. An explicit user-off choice is preserved; unset installs enable it by default.
(function () {
  const BUILTIN = Object.freeze({
    // Common transpositions and chat typos.
    teh: 'the', tje: 'the', thier: 'their', taht: 'that', thta: 'that', hte: 'the',
    adn: 'and', nad: 'and', becuase: 'because', becasue: 'because', becouse: 'because',
    beacuse: 'because', somthing: 'something', somethign: 'something', anyting: 'anything',
    anythign: 'anything', nothign: 'nothing', eveything: 'everything', everyting: 'everything',
    evrything: 'everything', peopel: 'people', poeple: 'people', mesage: 'message', messege: 'message',
    woudl: 'would', woud: 'would', coudl: 'could', shoudl: 'should', throught: 'through',
    // The user-requested examples, plus common spelling mistakes.
    grammer: 'grammar', grammerly: 'Grammarly', gramar: 'grammar', automatcly: 'automatically',
    automaticly: 'automatically', automaticaly: 'automatically', definately: 'definitely',
    definetely: 'definitely', definitly: 'definitely', definatly: 'definitely',
    seperate: 'separate', seperte: 'separate', separte: 'separate', neccessary: 'necessary',
    necesary: 'necessary', occurance: 'occurrence', occurence: 'occurrence', occurrance: 'occurrence',
    occured: 'occurred', occuring: 'occurring', begining: 'beginning', beggining: 'beginning',
    goverment: 'government', governement: 'government', enviroment: 'environment', enviornment: 'environment',
    freind: 'friend', firend: 'friend', frend: 'friend', remeber: 'remember', tommorow: 'tomorrow',
    tommorrow: 'tomorrow', untill: 'until', wich: 'which', wierd: 'weird', recieve: 'receive',
    recieved: 'received', recieving: 'receiving', receieve: 'receive', beleive: 'believe',
    beleived: 'believed', beleiving: 'believing', belive: 'believe', acheive: 'achieve',
    acheived: 'achieved', acheiving: 'achieving', acheivement: 'achievement', aquire: 'acquire',
    aquired: 'acquired', accomodate: 'accommodate', accomodated: 'accommodated',
    accomodation: 'accommodation', accomodating: 'accommodating', accomodations: 'accommodations',
    embarass: 'embarrass', embarassed: 'embarrassed', embarassing: 'embarrassing',
    dissapear: 'disappear', dissapoint: 'disappoint', dissapointed: 'disappointed',
    aparently: 'apparently', apparantly: 'apparently', aparent: 'apparent', arguement: 'argument',
    arguements: 'arguments', attatch: 'attach', attatched: 'attached', attatchment: 'attachment',
    buisness: 'business', bussiness: 'business', calender: 'calendar', cemetary: 'cemetery',
    comming: 'coming', commited: 'committed', comitted: 'committed', committment: 'commitment',
    concious: 'conscious', desparate: 'desperate', existance: 'existence', familar: 'familiar',
    febuary: 'February', finaly: 'finally', freindly: 'friendly', guarentee: 'guarantee',
    independant: 'independent', knowlege: 'knowledge', liason: 'liaison', maintenence: 'maintenance',
    occassion: 'occasion', persue: 'pursue', priviledge: 'privilege', reccomend: 'recommend',
    reccomendation: 'recommendation', relevent: 'relevant', responsibilty: 'responsibility',
    succes: 'success', sucess: 'success', succesful: 'successful', sucessful: 'successful',
    suprise: 'surprise', wellcome: 'welcome', importent: 'important', availible: 'available',
    langauge: 'language', cleint: 'client', probly: 'probably', thier: 'their',
    // Common contractions and spacing fixes.
    dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", wont: "won't",
    isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't", havent: "haven't",
    hasnt: "hasn't", hadnt: "hadn't", couldnt: "couldn't", wouldnt: "wouldn't", shouldnt: "shouldn't",
    youre: "you're", theyre: "they're", thats: "that's", whats: "what's", theres: "there's",
    ive: "I've", im: "I'm", youve: "you've", theyve: "they've", weve: "we've",
    alot: 'a lot', aswell: 'as well', atleast: 'at least', incase: 'in case', inorder: 'in order',
  });

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
    if (typeof value !== 'string' || !Number.isInteger(caret) || caret < 0 || caret > value.length) return null;
    const left = value.slice(0, caret);
    // Periods are corrected only after a following space/newline, avoiding domains such as example.com.
    // Other sentence punctuation can be corrected immediately or when followed by whitespace.
    const match = left.match(/([A-Za-z]{2,})([.,!?;:)\]]{0,3}[ \t\r\n]+|[!?,;:)\]])$/);
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

    const replacement = dictionary.get(word.toLowerCase());
    if (!replacement) return null;
    const fixed = fixCase(word, replacement);
    if (fixed.toLowerCase() === word.toLowerCase()) return null;
    return { start, end: start + word.length, fixed };
  }

  YM.definePlugin({
    name: 'AutoCorrect',
    description: 'Automatically correct common English typos as you type. Offline and customizable; it does not rewrite grammar or send text anywhere.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: true,
    api: { buildDictionary, findCorrection, fixCase },
    options: {
      autoCorrect: {
        type: 'boolean',
        default: true,
        description: 'Automatically correct listed typos after a word boundary while typing',
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
      const allowedInputTypes = new Set(['insertText', 'insertLineBreak', 'insertParagraph']);

      function onInput(event) {
        const field = event.target;
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
          const correction = findCorrection(field.value, caret, dictionary);
          if (!correction) return;
          try {
            field.setRangeText(correction.fixed, correction.start, correction.end, 'preserve');
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

      document.addEventListener('input', onInput, true);
      const offSettings = ctx.settings.onChange((key) => {
        if (key === 'customCorrections') dictionary = buildDictionary(ctx.settings.store.customCorrections);
      });
      ctx.cleanup(() => {
        active = false;
        document.removeEventListener('input', onInput, true);
        try { offSettings && offSettings(); } catch (_) {}
      });
    },
  });
})();
