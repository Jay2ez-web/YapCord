// ClearURLs (port, built-in rule subset): removes tracking parameters from links in messages you send.
(function () {
  const COMMON = [
    /^utm_/i, /^fbclid$/i, /^gclid$/i, /^gclsrc$/i, /^dclid$/i, /^gbraid$/i, /^wbraid$/i, /^msclkid$/i, /^mc_cid$/i, /^mc_eid$/i,
    /^igshid$/i, /^igsh$/i, /^ref_src$/i, /^ref_url$/i, /^twclid$/i, /^yclid$/i, /^_ga$/i, /^_gl$/i, /^vero_id$/i, /^vero_conv$/i,
    /^oly_enc_id$/i, /^oly_anon_id$/i, /^__s$/i, /^mkt_tok$/i, /^trk$/i, /^trkcampaign$/i, /^hsa_/i, /^s_cid$/i, /^pk_(campaign|kwd|source|medium)$/i,
    /^wickedid$/i, /^_hsenc$/i, /^_hsmi$/i, /^__hstc$/i, /^__hssc$/i, /^__hsfp$/i, /^ttclid$/i, /^li_fat_id$/i, /^epik$/i, /^ocid$/i,
  ];
  // Parameters that are only tracking on specific sites.
  const SITE = [
    { host: /(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/i, params: [/^si$/i, /^pp$/i, /^feature$/i] },
    { host: /(^|\.)(spotify\.com|spotify\.link)$/i, params: [/^si$/i, /^context$/i, /^nd$/i, /^dlsi$/i] },
    { host: /(^|\.)(twitter\.com|x\.com)$/i, params: [/^s$/i, /^t$/i, /^ref_src$/i] },
    { host: /(^|\.)(amazon\.[a-z.]+)$/i, params: [/^tag$/i, /^ref_?$/i, /^pf_rd_/i, /^pd_rd_/i, /^psc$/i, /^linkcode$/i, /^creative/i, /^th$/i] },
    { host: /(^|\.)(reddit\.com)$/i, params: [/^share_id$/i, /^utm_/i, /^ref$/i, /^ref_source$/i] },
    { host: /(^|\.)(instagram\.com|facebook\.com|tiktok\.com)$/i, params: [/^igshid$/i, /^_t$/i, /^_r$/i, /^is_from_webapp$/i, /^sender_device$/i, /^web_id$/i, /^refer$/i, /^fbclid$/i] },
  ];

  function cleanUrl(raw, extra) {
    let u;
    try {
      u = new URL(raw);
    } catch (_) {
      return raw;
    }
    const sites = SITE.filter((s) => s.host.test(u.hostname));
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (COMMON.some((re) => re.test(key)) || sites.some((s) => s.params.some((re) => re.test(key))) || extra.has(key.toLowerCase())) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return raw;
    return u.toString();
  }

  function clean(content, extraList) {
    const extra = new Set(String(extraList || '').split(/[\s,;]+/).filter(Boolean).map((s) => s.toLowerCase()));
    return content.replace(/https?:\/\/[^\s<>"]+/gi, (match) => {
      const tail = (match.match(/[.,;:!?)\]]+$/) || [''])[0];
      const url = tail ? match.slice(0, -tail.length) : match;
      return cleanUrl(url, extra) + tail;
    });
  }

  YM.definePlugin({
    name: 'ClearURLs',
    description: 'Removes tracking parameters (utm_*, fbclid, ...) from links before your message is sent.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Privacy', 'Utility'],
    api: { clean },
    options: {
      extraParams: { type: 'string', default: '', description: 'Extra parameter names to remove (comma separated)' },
    },
    start(ctx) {
      const handler = (msg) => { msg.content = clean(msg.content, ctx.settings.store.extraParams); };
      ctx.cleanup(YM.messageEvents.addPreSendListener(handler));
      ctx.cleanup(YM.messageEvents.addPreEditListener(handler));
    },
  });
})();
