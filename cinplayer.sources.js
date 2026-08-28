'use strict';

(function () {
  function inferType(url) {
    var clean = String(url || '').split('?')[0].toLowerCase();
    if (clean.endsWith('.m3u8') || clean.endsWith('.m3u')) return 'hls';
    if (clean.endsWith('.mp4') || clean.endsWith('.m4v') || clean.endsWith('.webm')) return 'mp4';
    return 'embed';
  }

  function fill(template, context) {
    return template
      .replaceAll('{id}', encodeURIComponent(context.id || ''))
      .replaceAll('{season}', encodeURIComponent(context.season || '1'))
      .replaceAll('{episode}', encodeURIComponent(context.episode || '1'));
  }

  async function fetchTestStream() {
    var response = await fetch('/api?test=1');
    var data = await response.json();
    if (!response.ok || !data || !data.url) {
      throw new Error((data && data.error) || 'Self-test source unavailable');
    }
    return { url: data.url, type: 'hls', provider: 'CinPlayer test' };
  }

  function adapter(id, label, color, provider, movie, tv) {
    return {
      id: id,
      label: label,
      color: color,
      provider: provider,
      resolve: async function (context) {
        var override = context.params.get(id);
        if (override) {
          return { url: override, type: inferType(override), provider: 'manual override' };
        }

        if (!context.id) return null;
        var template = context.season ? tv : movie;
        if (!template) return null;

        return { url: fill(template, context), type: 'embed', provider: provider };
      }
    };
  }

  var sources = [
    adapter('monkey', 'Monkey', '#ff7a66', 'VidFast',
      'https://vidfast.to/embed/movie/{id}',
      'https://vidfast.to/embed/tv/{id}/{season}/{episode}'),

    adapter('elk', 'Elk', '#6ec8ff', 'Videasy',
      'https://player.videasy.net/movie/{id}?overlay=true',
      'https://player.videasy.net/tv/{id}/{season}/{episode}?overlay=true&episodeSelector=true&nextEpisode=true'),

    adapter('panda', 'Panda', '#c69cff', 'VidKing',
      'https://www.vidking.net/embed/movie/{id}?autoPlay=true',
      'https://www.vidking.net/embed/tv/{id}/{season}/{episode}?autoPlay=true&nextEpisode=true&episodeSelector=true'),

    adapter('otter', 'Otter', '#ffd166', '2Embed',
      'https://www.2embed.to/embed/tmdb/movie?id={id}',
      'https://www.2embed.to/embed/tmdb/tv?id={id}&s={season}&e={episode}'),

    adapter('fox', 'Fox', '#ff9f43', 'AutoEmbed',
      'https://autoembed.co/movie/tmdb/{id}',
      'https://autoembed.co/tv/tmdb/{id}-{season}-{episode}'),

    adapter('lynx', 'Lynx', '#7ee0c3', 'VidSrc.rip',
      'https://vidsrc.rip/embed/movie/{id}',
      'https://vidsrc.rip/embed/tv/{id}/{season}/{episode}'),

    adapter('bear', 'Bear', '#f08ab1', 'VidSrc.xyz',
      'https://vidsrc.xyz/embed/movie/{id}',
      'https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}'),

    adapter('raven', 'Raven', '#b9a7ff', '111Movies',
      'https://111movies.net/movie/{id}',
      'https://111movies.net/tv/{id}/{season}/{episode}'),

    adapter('koala', 'Koala', '#8bd17c', 'TouStream',
      'https://toustream.xyz/tou/movies/{id}',
      'https://toustream.xyz/tou/tv/{id}/{season}/{episode}'),

    adapter('gecko', 'Gecko', '#66d9ef', 'VidSrc Hair',
      'https://vidsrc.hair/embed/movie/{id}',
      'https://vidsrc.hair/embed/tv/{id}/{season}/{episode}'),

    adapter('coyote', 'Coyote', '#f1a66a', 'VidSrc.tw',
      'https://vidsrc.tw/embed/movie/{id}',
      'https://vidsrc.tw/embed/tv/{id}/{season}/{episode}'),

    adapter('falcon', 'Falcon', '#8aa7ff', 'EmbedSU',
      'https://embed.su/embed/movie/{id}',
      'https://embed.su/embed/tv/{id}/{season}/{episode}'),

    adapter('wolf', 'Wolf', '#ef8b8b', 'MoviesAPI',
      'https://moviesapi.club/movie/{id}',
      'https://moviesapi.club/tv/{id}-{season}-{episode}'),

    adapter('rabbit', 'Rabbit', '#df9cf0', 'MultiEmbed',
      'https://multiembed.mov/?video_id={id}&tmdb=1',
      'https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}'),

    adapter('tiger', 'Tiger', '#ffb84d', 'VidZee',
      'https://player.vidzee.wtf/embed/movie/{id}',
      'https://player.vidzee.wtf/embed/tv/{id}/{season}/{episode}'),

    adapter('deer', 'Deer', '#8fd3ff', 'VidJoy',
      'https://vidjoy.pro/embed/movie/{id}',
      'https://vidjoy.pro/embed/tv/{id}/{season}/{episode}'),

    adapter('badger', 'Badger', '#a8df8e', 'VidNest',
      'https://vidnest.fun/movie/{id}',
      'https://vidnest.fun/tv/{id}/{season}/{episode}'),

    adapter('hawk', 'Hawk', '#f29ac2', 'MappleTV',
      'https://mapple.uk/watch/movie/{id}?autoPlay=true',
      'https://mapple.uk/watch/tv/{id}-{season}-{episode}?nextButton=true&autoPlay=true'),

    adapter('bison', 'Bison', '#b5a7ff', 'AutoEmbed player',
      'https://player.autoembed.cc/embed/movie/{id}',
      'https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}'),

    adapter('heron', 'Heron', '#70d6c7', 'Vidify',
      'https://vidify.top/embed/movie/{id}',
      'https://vidify.top/embed/tv/{id}/{season}/{episode}'),

    adapter('moose', 'Moose', '#f0c36d', 'VidCore',
      'https://www.vidcore.org/embed/movie/{id}',
      'https://www.vidcore.org/embed/tv/{id}/{season}/{episode}'),

    adapter('seal', 'Seal', '#7eb8ff', 'VidPlay',
      'https://vidplay.cc/embed/movie/{id}',
      null),

    /* Alternate domains. Keeping them as separate animals means a dead
       domain can fail without taking the whole provider family with it. */
    adapter('marten', 'Marten', '#ff8c7a', 'VidSrc.pm',
      'https://vidsrc.pm/embed/movie/{id}',
      'https://vidsrc.pm/embed/tv/{id}/{season}/{episode}'),

    adapter('orca', 'Orca', '#7fd7ff', '2Embed.skin',
      'https://2embed.skin/embed/movie/{id}',
      'https://2embed.skin/embed/tv/{id}/{season}/{episode}'),

    adapter('ibex', 'Ibex', '#d2a7ff', '2Embed.cc',
      'https://2embed.cc/embed/movie/{id}',
      'https://2embed.cc/embed/tv/{id}/{season}/{episode}'),

    adapter('yak', 'Yak', '#ffb36b', 'VidSrc.to',
      'https://vidsrc.to/embed/movie/{id}',
      'https://vidsrc.to/embed/tv/{id}/{season}/{episode}'),

    adapter('mole', 'Mole', '#76d6bd', 'VidSrc.cc',
      'https://vidsrc.cc/v2/embed/movie/{id}?autoPlay=false',
      'https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}?autoPlay=false'),

    adapter('parrot', 'Parrot', '#f28eb5', 'MoviesAPI.to',
      'https://moviesapi.to/embed/movie/{id}',
      'https://moviesapi.to/embed/tv/{id}/{season}/{episode}'),

    adapter('swan', 'Swan', '#92e391', 'VidFast.co',
      'https://vidfast.co/embed/movie/{id}',
      'https://vidfast.co/embed/tv/{id}/{season}/{episode}'),

    adapter('lemur', 'Lemur', '#8ca7ff', 'VidFast.pro',
      'https://vidfast.pro/movie/{id}',
      'https://vidfast.pro/tv/{id}/{season}/{episode}'),

    adapter('goat', 'Goat', '#e5c271', 'VidSrc.mov',
      'https://vidsrc.mov/embed/movie/{id}',
      'https://vidsrc.mov/embed/tv/{id}/{season}/{episode}')
  ];

  var monkey = sources[0];
  var originalResolve = monkey.resolve;
  monkey.resolve = async function (context) {
    if (context.test) return fetchTestStream();
    return originalResolve(context);
  };

  /* Warm DNS/TLS only. CinPlayer still loads providers lazily in pairs. */
  var origins = new Set();
  sources.forEach(function (source) {
    try {
      var ctx = { id: '1', season: '', episode: '1', params: new URLSearchParams() };
      Promise.resolve(source.resolve(ctx)).then(function (candidate) {
        if (!candidate || !candidate.url) return;
        try {
          var origin = new URL(candidate.url).origin;
          if (origins.has(origin)) return;
          origins.add(origin);

          var preconnect = document.createElement('link');
          preconnect.rel = 'preconnect';
          preconnect.href = origin;
          document.head.appendChild(preconnect);

          var dns = document.createElement('link');
          dns.rel = 'dns-prefetch';
          dns.href = origin;
          document.head.appendChild(dns);
        } catch (_) {}
      }).catch(function () {});
    } catch (_) {}
  });

  window.CINPLAYER_SOURCE_ADAPTERS = sources;
})();
