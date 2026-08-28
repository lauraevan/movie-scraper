'use strict';

(function () {
  function inferType(url, hinted) {
    if (hinted) {
      var hint = String(hinted).toLowerCase();
      if (hint.includes('m3u8') || hint.includes('hls')) return 'hls';
      if (hint.includes('mpd') || hint.includes('dash')) return 'dash';
      if (hint.includes('mp4') || hint.includes('video')) return 'mp4';
    }

    var clean = String(url || '').split('?')[0].toLowerCase();
    if (clean.includes('.m3u8') || clean.includes('.m3u')) return 'hls';
    if (clean.includes('.mpd')) return 'dash';
    if (clean.endsWith('.mp4') || clean.endsWith('.m4v') || clean.endsWith('.webm')) return 'mp4';
    return 'embed';
  }

  function fill(template, context) {
    return String(template || '')
      .replaceAll('{id}', encodeURIComponent(context.id || ''))
      .replaceAll('{season}', encodeURIComponent(context.season || '1'))
      .replaceAll('{episode}', encodeURIComponent(context.episode || '1'));
  }

  function vidFastVC(context) {
    if (!context.id) return null;
    if (context.season) {
      return 'https://vidfast.vc/tv/' + encodeURIComponent(context.id) + '/' +
        encodeURIComponent(context.season || '1') + '/' +
        encodeURIComponent(context.episode || '1');
    }
    return 'https://vidfast.vc/movie/' + encodeURIComponent(context.id);
  }

  async function fetchTestStream() {
    var response = await fetch('/api?test=1');
    var data = await response.json();
    if (!response.ok || !data || !data.url) {
      throw new Error((data && data.error) || 'Self-test source unavailable');
    }
    return { url: data.url, type: 'hls', provider: 'CinPlayer test' };
  }

  function nativeVidFast() {
    return {
      id: 'monkey',
      label: 'Monkey',
      color: '#ff7a66',
      provider: 'VidFast',
      primary: true,
      resolve: async function (context) {
        if (context.test) return fetchTestStream();

        var override = context.params.get('monkey');
        if (override) {
          return { url: override, type: inferType(override), provider: 'manual override' };
        }

        if (!context.id) return null;

        /*
          Monkey always prefers the authorized native VidFast bridge.
          Until that bridge is configured (or whenever it is unavailable),
          Monkey falls back to VidFast's VC embed before CinPlayer moves to Elk.
        */
        if (context.params.get('native') !== '0') {
          var controller = new AbortController();
          var nativeTimeout = Math.max(350, Math.min(3000,
            Number(context.params.get('nativeTimeout') || 1000)));
          var timer = setTimeout(function () { controller.abort(); }, nativeTimeout);

          try {
            var query = new URLSearchParams();
            query.set('id', context.id);
            if (context.season) query.set('s', context.season);
            if (context.episode) query.set('e', context.episode);

            var response = await fetch('/api/vidfast?' + query.toString(), {
              cache: 'no-store',
              signal: controller.signal
            });
            var data = await response.json().catch(function () { return {}; });

            if (response.ok && data && data.url) {
              return {
                url: data.url,
                type: inferType(data.url, data.type),
                provider: data.provider || 'VidFast Native',
                tracks: Array.isArray(data.tracks) ? data.tracks : [],
                audio: Array.isArray(data.audio) ? data.audio : [],
                proxy: data.proxy === true
              };
            }
          } catch (_) {
            /* Fast fail into the VC embed below. */
          } finally {
            clearTimeout(timer);
          }
        }

        return {
          url: vidFastVC(context),
          type: 'embed',
          provider: 'VidFast VC',
          fallback: true
        };
      }
    };
  }

  function embed(id, label, color, provider, movie, tv) {
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
    nativeVidFast(),

    embed('elk', 'Elk', '#6ec8ff', 'Videasy',
      'https://player.videasy.net/movie/{id}',
      'https://player.videasy.net/tv/{id}/{season}/{episode}'),

    embed('panda', 'Panda', '#c69cff', 'VidKing',
      'https://www.vidking.net/embed/movie/{id}?autoPlay=true',
      'https://www.vidking.net/embed/tv/{id}/{season}/{episode}?autoPlay=true&nextEpisode=true&episodeSelector=true'),

    embed('otter', 'Otter', '#ffd166', '2Embed',
      'https://www.2embed.to/embed/tmdb/movie?id={id}',
      'https://www.2embed.to/embed/tmdb/tv?id={id}&s={season}&e={episode}'),

    embed('fox', 'Fox', '#ff9f43', 'AutoEmbed',
      'https://autoembed.co/movie/tmdb/{id}',
      'https://autoembed.co/tv/tmdb/{id}-{season}-{episode}'),

    embed('lynx', 'Lynx', '#7ee0c3', 'VidSrc.rip',
      'https://vidsrc.rip/embed/movie/{id}',
      'https://vidsrc.rip/embed/tv/{id}/{season}/{episode}'),

    embed('bear', 'Bear', '#f08ab1', 'VidSrc.xyz',
      'https://vidsrc.xyz/embed/movie/{id}',
      'https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}'),

    embed('raven', 'Raven', '#b9a7ff', '111Movies',
      'https://111movies.net/movie/{id}',
      'https://111movies.net/tv/{id}/{season}/{episode}'),

    embed('koala', 'Koala', '#8bd17c', 'TouStream',
      'https://toustream.xyz/tou/movies/{id}',
      'https://toustream.xyz/tou/tv/{id}/{season}/{episode}'),

    embed('gecko', 'Gecko', '#66d9ef', 'VidSrc Hair',
      'https://vidsrc.hair/embed/movie/{id}',
      'https://vidsrc.hair/embed/tv/{id}/{season}/{episode}'),

    embed('coyote', 'Coyote', '#f1a66a', 'VidSrc Embed',
      'https://vidsrc-embed.ru/embed/movie?tmdb={id}&autoplay=1',
      'https://vidsrc-embed.ru/embed/tv?tmdb={id}&season={season}&episode={episode}&autoplay=1'),

    embed('falcon', 'Falcon', '#8aa7ff', 'EmbedSU',
      'https://embed.su/embed/movie/{id}',
      'https://embed.su/embed/tv/{id}/{season}/{episode}'),

    embed('wolf', 'Wolf', '#ef8b8b', 'MoviesAPI',
      'https://moviesapi.club/movie/{id}',
      'https://moviesapi.club/tv/{id}-{season}-{episode}'),

    embed('rabbit', 'Rabbit', '#df9cf0', 'MultiEmbed',
      'https://multiembed.mov/?video_id={id}&tmdb=1',
      'https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}'),

    embed('tiger', 'Tiger', '#ffb84d', 'VidZee',
      'https://player.vidzee.wtf/embed/movie/{id}',
      'https://player.vidzee.wtf/embed/tv/{id}/{season}/{episode}'),

    embed('deer', 'Deer', '#8fd3ff', 'VidJoy',
      'https://vidjoy.pro/embed/movie/{id}',
      'https://vidjoy.pro/embed/tv/{id}/{season}/{episode}'),

    embed('badger', 'Badger', '#a8df8e', 'VidNest',
      'https://vidnest.fun/movie/{id}',
      'https://vidnest.fun/tv/{id}/{season}/{episode}'),

    embed('hawk', 'Hawk', '#f29ac2', 'MappleTV',
      'https://mapple.uk/watch/movie/{id}?autoPlay=true',
      'https://mapple.uk/watch/tv/{id}-{season}-{episode}?nextButton=true&autoPlay=true'),

    embed('bison', 'Bison', '#b5a7ff', 'AutoEmbed Player',
      'https://player.autoembed.cc/embed/movie/{id}',
      'https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}'),

    embed('heron', 'Heron', '#70d6c7', 'Vidify',
      'https://player.vidify.top/embed/movie/{id}',
      'https://player.vidify.top/embed/tv/{id}/{season}/{episode}'),

    embed('moose', 'Moose', '#f0c36d', 'VidCore',
      'https://www.vidcore.org/embed/movie/{id}?autoPlay=true',
      'https://www.vidcore.org/embed/tv/{id}/{season}/{episode}?autoPlay=true'),

    embed('seal', 'Seal', '#7eb8ff', 'VidPlay',
      'https://vidplay.cc/embed/movie/{id}', null),

    embed('capybara', 'Capybara', '#c8a87b', 'Spenflix V4',
      'https://spencerdevs.xyz/movie/{id}',
      'https://spencerdevs.xyz/tv/{id}/{season}/{episode}'),

    /* Extra provider/domain fallbacks. */
    embed('macaque', 'Macaque', '#ff8b72', 'VidFast.to',
      'https://vidfast.to/embed/movie/{id}',
      'https://vidfast.to/embed/tv/{id}/{season}/{episode}'),

    embed('marten', 'Marten', '#ff8c7a', 'VidSrc.pm',
      'https://vidsrc.pm/embed/movie/{id}',
      'https://vidsrc.pm/embed/tv/{id}/{season}/{episode}'),

    embed('orca', 'Orca', '#7fd7ff', '2Embed.skin',
      'https://2embed.skin/embed/movie/{id}',
      'https://2embed.skin/embed/tv/{id}/{season}/{episode}'),

    embed('ibex', 'Ibex', '#d2a7ff', '2Embed.cc',
      'https://2embed.cc/embed/movie/{id}',
      'https://2embed.cc/embed/tv/{id}/{season}/{episode}'),

    embed('yak', 'Yak', '#ffb36b', 'VidSrc.to',
      'https://vidsrc.to/embed/movie/{id}',
      'https://vidsrc.to/embed/tv/{id}/{season}/{episode}'),

    embed('mole', 'Mole', '#76d6bd', 'VidSrc.cc',
      'https://vidsrc.cc/v2/embed/movie/{id}?autoPlay=false',
      'https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}?autoPlay=false'),

    embed('parrot', 'Parrot', '#f28eb5', 'MoviesAPI.to',
      'https://moviesapi.to/embed/movie/{id}',
      'https://moviesapi.to/embed/tv/{id}/{season}/{episode}'),

    embed('swan', 'Swan', '#92e391', 'VidFast.co',
      'https://vidfast.co/embed/movie/{id}',
      'https://vidfast.co/embed/tv/{id}/{season}/{episode}'),

    embed('lemur', 'Lemur', '#8ca7ff', 'VidFast.pro',
      'https://vidfast.pro/movie/{id}',
      'https://vidfast.pro/tv/{id}/{season}/{episode}'),

    embed('goat', 'Goat', '#e5c271', 'VidSrc.mov',
      'https://vidsrc.mov/embed/movie/{id}',
      'https://vidsrc.mov/embed/tv/{id}/{season}/{episode}')
  ];

  /* Warm DNS/TLS without actually loading all of the players. */
  var origins = new Set();
  sources.forEach(function (source) {
    try {
      var ctx = { id: '1', season: '', episode: '1', params: new URLSearchParams() };
      Promise.resolve(source.resolve(ctx)).then(function (candidate) {
        if (!candidate || !candidate.url) return;
        var origin = new URL(candidate.url).origin;
        if (origins.has(origin)) return;
        origins.add(origin);

        var dns = document.createElement('link');
        dns.rel = 'dns-prefetch';
        dns.href = origin;
        document.head.appendChild(dns);

        var preconnect = document.createElement('link');
        preconnect.rel = 'preconnect';
        preconnect.href = origin;
        document.head.appendChild(preconnect);
      }).catch(function () {});
    } catch (_) {}
  });

  window.CINPLAYER_SOURCE_ADAPTERS = sources;
})();