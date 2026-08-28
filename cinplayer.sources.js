'use strict';

/*
  CinPlayer source adapters.

  Each adapter returns either:
    { url: 'https://example.com/master.m3u8', type: 'hls' }
    { url: 'https://example.com/video.mp4', type: 'mp4' }
    null

  The built-in adapters intentionally do not scrape or unlock third-party
  movie hosts. They accept direct media URLs you are authorized to use.

  Quick testing:
    ?test=1

  Direct-source testing:
    ?monkey=https%3A%2F%2Fexample.com%2Fmaster.m3u8
    ?monkey=...&elk=...&panda=...

  To connect licensed/private providers later, replace an adapter's resolve()
  function with your own authorized API call and return a direct HLS/MP4 URL.
*/

(function () {
  var NAMES = [
    ['monkey', 'Monkey'],
    ['elk', 'Elk'],
    ['panda', 'Panda'],
    ['otter', 'Otter'],
    ['fox', 'Fox'],
    ['lynx', 'Lynx'],
    ['bear', 'Bear'],
    ['raven', 'Raven'],
    ['koala', 'Koala'],
    ['gecko', 'Gecko'],
    ['coyote', 'Coyote'],
    ['falcon', 'Falcon']
  ];

  function inferType(url) {
    var clean = String(url || '').split('?')[0].toLowerCase();
    if (clean.endsWith('.m3u8') || clean.endsWith('.m3u')) return 'hls';
    if (clean.endsWith('.mp4') || clean.endsWith('.m4v') || clean.endsWith('.webm')) return 'mp4';
    return 'auto';
  }

  async function fetchTestStream() {
    var response = await fetch('/api?test=1');
    var data = await response.json();
    if (!response.ok || !data || !data.url) {
      throw new Error((data && data.error) || 'Self-test source unavailable');
    }
    return { url: data.url, type: 'hls' };
  }

  window.CINPLAYER_SOURCE_ADAPTERS = NAMES.map(function (entry, index) {
    var id = entry[0];
    var label = entry[1];

    return {
      id: id,
      label: label,
      resolve: async function (context) {
        if (context.test && index === 0) {
          return fetchTestStream();
        }

        var direct = context.params.get(id);
        if (!direct) return null;

        return {
          url: direct,
          type: inferType(direct)
        };
      }
    };
  });
})();
