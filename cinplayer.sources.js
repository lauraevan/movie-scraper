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

  function adapter(id, label, provider, movie, tv) {
    return {
      id: id,
      label: label,
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
    adapter('monkey', 'Monkey', 'VidFast',
      'https://vidfast.to/embed/movie/{id}',
      'https://vidfast.to/embed/tv/{id}/{season}/{episode}'),

    adapter('elk', 'Elk', 'Videasy',
      'https://player.videasy.net/movie/{id}?overlay=true',
      'https://player.videasy.net/tv/{id}/{season}/{episode}?overlay=true&episodeSelector=true&nextEpisode=true'),

    adapter('panda', 'Panda', 'VidKing',
      'https://www.vidking.net/embed/movie/{id}?autoPlay=true',
      'https://www.vidking.net/embed/tv/{id}/{season}/{episode}?autoPlay=true&nextEpisode=true&episodeSelector=true'),

    adapter('otter', 'Otter', '2Embed',
      'https://www.2embed.to/embed/tmdb/movie?id={id}',
      'https://www.2embed.to/embed/tmdb/tv?id={id}&s={season}&e={episode}'),

    adapter('fox', 'Fox', 'AutoEmbed',
      'https://autoembed.co/movie/tmdb/{id}',
      'https://autoembed.co/tv/tmdb/{id}-{season}-{episode}'),

    adapter('lynx', 'Lynx', 'VidSrc.rip',
      'https://vidsrc.rip/embed/movie/{id}',
      'https://vidsrc.rip/embed/tv/{id}/{season}/{episode}'),

    adapter('bear', 'Bear', 'VidSrc.xyz',
      'https://vidsrc.xyz/embed/movie/{id}',
      'https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}'),

    adapter('raven', 'Raven', '111Movies',
      'https://111movies.net/movie/{id}',
      'https://111movies.net/tv/{id}/{season}/{episode}'),

    adapter('koala', 'Koala', 'TouStream',
      'https://toustream.xyz/tou/movies/{id}',
      'https://toustream.xyz/tou/tv/{id}/{season}/{episode}'),

    adapter('gecko', 'Gecko', 'VidSrc Hair',
      'https://vidsrc.hair/embed/movie/{id}',
      'https://vidsrc.hair/embed/tv/{id}/{season}/{episode}'),

    adapter('coyote', 'Coyote', 'VidSrc.tw',
      'https://vidsrc.tw/embed/movie/{id}',
      'https://vidsrc.tw/embed/tv/{id}/{season}/{episode}'),

    adapter('falcon', 'Falcon', 'EmbedSU',
      'https://embed.su/embed/movie/{id}',
      'https://embed.su/embed/tv/{id}/{season}/{episode}'),

    adapter('wolf', 'Wolf', 'MoviesAPI',
      'https://moviesapi.club/movie/{id}',
      'https://moviesapi.club/tv/{id}-{season}-{episode}'),

    adapter('rabbit', 'Rabbit', 'MultiEmbed',
      'https://multiembed.mov/?video_id={id}&tmdb=1',
      'https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}'),

    adapter('tiger', 'Tiger', 'VidZee',
      'https://player.vidzee.wtf/embed/movie/{id}',
      'https://player.vidzee.wtf/embed/tv/{id}/{season}/{episode}'),

    adapter('deer', 'Deer', 'VidJoy',
      'https://vidjoy.pro/embed/movie/{id}',
      'https://vidjoy.pro/embed/tv/{id}/{season}/{episode}'),

    adapter('badger', 'Badger', 'VidNest',
      'https://vidnest.fun/movie/{id}',
      'https://vidnest.fun/tv/{id}/{season}/{episode}'),

    adapter('hawk', 'Hawk', 'MappleTV',
      'https://mapple.uk/watch/movie/{id}?autoPlay=true',
      'https://mapple.uk/watch/tv/{id}-{season}-{episode}?nextButton=true&autoPlay=true'),

    adapter('bison', 'Bison', 'AutoEmbed player',
      'https://player.autoembed.cc/embed/movie/{id}',
      'https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}')
  ];

  var monkey = sources[0];
  var originalResolve = monkey.resolve;
  monkey.resolve = async function (context) {
    if (context.test) return fetchTestStream();
    return originalResolve(context);
  };

  window.CINPLAYER_SOURCE_ADAPTERS = sources;
})();
