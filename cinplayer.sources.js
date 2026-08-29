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
        encodeURIComponent(context.season || '1') + '/' + encodeURIComponent(context.episode || '1');
    }
    return 'https://vidfast.vc/movie/' + encodeURIComponent(context.id);
  }

  async function testStream() {
    var response = await fetch('/api?test=1');
    var data = await response.json();
    if (!response.ok || !data || !data.url) throw new Error((data && data.error) || 'Self-test unavailable');
    return { url: data.url, type: 'hls', provider: 'CinPlayer test', clean: true };
  }

  function monkey() {
    return {
      id: 'monkey', label: 'Monkey', color: '#ff7a66', provider: 'VidFast VC', primary: true,
      resolve: async function (context) {
        if (context.test) return testStream();
        var override = context.params.get('monkey');
        if (override) return { url: override, type: inferType(override), provider: 'manual override' };
        if (!context.id) return null;
        await new Promise(function (resolve) { setTimeout(resolve, 0); });

        /* The owner-authorized native bridge is opt-in until its real backend is
           supplied. Default Monkey therefore goes straight to VidFast VC. */
        if (context.params.get('native') === '1') {
          var controller = new AbortController();
          var timer = setTimeout(function () { controller.abort(); }, 550);
          try {
            var query = new URLSearchParams({ id: context.id });
            if (context.season) query.set('s', context.season);
            if (context.episode) query.set('e', context.episode);
            var response = await fetch('/api/vidfast?' + query, { cache: 'no-store', signal: controller.signal });
            var data = await response.json().catch(function () { return {}; });
            if (response.ok && data && data.url) {
              return {
                url: data.url,
                type: inferType(data.url, data.type),
                provider: data.provider || 'VidFast Native',
                tracks: Array.isArray(data.tracks) ? data.tracks : [],
                audio: Array.isArray(data.audio) ? data.audio : [],
                proxy: data.proxy === true,
                clean: true
              };
            }
          } catch (_) {
          } finally {
            clearTimeout(timer);
          }
        }
        return { url: vidFastVC(context), type: 'embed', provider: 'VidFast VC', fallback: true };
      }
    };
  }

  /* Restores the original repo's ad-free idea: resolve VidLink to a direct HLS
     playlist and play it inside CinPlayer instead of loading VidLink's page. */
  function nativeVidLink() {
    return {
      id: 'jaguar', label: 'Jaguar', color: '#f0b86e', provider: 'VidLink Native', clean: true,
      resolve: async function (context) {
        var override = context.params.get('jaguar');
        if (override) {
          return { url: override, type: inferType(override), provider: 'manual override', proxy: true, clean: true };
        }
        if (!context.id || context.test) return null;

        var query = new URLSearchParams();
        query.set('id', context.id);
        if (context.season) query.set('s', context.season);
        if (context.episode) query.set('e', context.episode);

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 2400);
        try {
          var response = await fetch('/api?' + query.toString(), { cache: 'no-store', signal: controller.signal });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok || !data || !data.url) throw new Error(data.error || 'native VidLink unavailable');
          return {
            url: data.url,
            type: 'hls',
            provider: 'VidLink Native',
            proxy: true,
            clean: true
          };
        } finally {
          clearTimeout(timer);
        }
      }
    };
  }

  function embed(def) {
    return {
      id: def[0], label: def[1], color: def[2], provider: def[3],
      resolve: async function (context) {
        var override = context.params.get(def[0]);
        if (override) return { url: override, type: inferType(override), provider: 'manual override' };
        if (!context.id) return null;
        var template = context.season ? def[5] : def[4];
        if (!template) return null;
        return { url: fill(template, context), type: 'embed', provider: def[3] };
      }
    };
  }

  var defs = [
    ['elk','Elk','#6ec8ff','Videasy','https://player.videasy.net/movie/{id}','https://player.videasy.net/tv/{id}/{season}/{episode}'],
    ['panda','Panda','#c69cff','VidKing','https://www.vidking.net/embed/movie/{id}?autoPlay=true','https://www.vidking.net/embed/tv/{id}/{season}/{episode}?autoPlay=true&nextEpisode=true&episodeSelector=true'],
    ['otter','Otter','#ffd166','2Embed','https://www.2embed.to/embed/tmdb/movie?id={id}','https://www.2embed.to/embed/tmdb/tv?id={id}&s={season}&e={episode}'],
    ['fox','Fox','#ff9f43','AutoEmbed','https://autoembed.co/movie/tmdb/{id}','https://autoembed.co/tv/tmdb/{id}-{season}-{episode}'],
    ['lynx','Lynx','#7ee0c3','VidSrc.rip','https://vidsrc.rip/embed/movie/{id}','https://vidsrc.rip/embed/tv/{id}/{season}/{episode}'],
    ['bear','Bear','#f08ab1','VidSrc.xyz','https://vidsrc.xyz/embed/movie/{id}','https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}'],
    ['raven','Raven','#b9a7ff','111Movies','https://111movies.net/movie/{id}','https://111movies.net/tv/{id}/{season}/{episode}'],
    ['koala','Koala','#8bd17c','TouStream','https://toustream.xyz/tou/movies/{id}','https://toustream.xyz/tou/tv/{id}/{season}/{episode}'],
    ['gecko','Gecko','#66d9ef','VidSrc Hair','https://vidsrc.hair/embed/movie/{id}','https://vidsrc.hair/embed/tv/{id}/{season}/{episode}'],
    ['coyote','Coyote','#f1a66a','VidSrc Embed','https://vidsrc-embed.ru/embed/movie?tmdb={id}&autoplay=1','https://vidsrc-embed.ru/embed/tv?tmdb={id}&season={season}&episode={episode}&autoplay=1'],
    ['falcon','Falcon','#8aa7ff','EmbedSU','https://embed.su/embed/movie/{id}','https://embed.su/embed/tv/{id}/{season}/{episode}'],
    ['wolf','Wolf','#ef8b8b','MoviesAPI','https://moviesapi.club/movie/{id}','https://moviesapi.club/tv/{id}-{season}-{episode}'],
    ['rabbit','Rabbit','#df9cf0','MultiEmbed','https://multiembed.mov/?video_id={id}&tmdb=1','https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}'],
    ['tiger','Tiger','#ffb84d','VidZee','https://player.vidzee.wtf/embed/movie/{id}','https://player.vidzee.wtf/embed/tv/{id}/{season}/{episode}'],
    ['deer','Deer','#8fd3ff','VidJoy','https://vidjoy.pro/embed/movie/{id}','https://vidjoy.pro/embed/tv/{id}/{season}/{episode}'],
    ['badger','Badger','#a8df8e','VidNest','https://vidnest.fun/movie/{id}','https://vidnest.fun/tv/{id}/{season}/{episode}'],
    ['hawk','Hawk','#f29ac2','MappleTV','https://mapple.uk/watch/movie/{id}?autoPlay=true','https://mapple.uk/watch/tv/{id}-{season}-{episode}?nextButton=true&autoPlay=true'],
    ['bison','Bison','#b5a7ff','AutoEmbed Player','https://player.autoembed.cc/embed/movie/{id}','https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}'],
    ['heron','Heron','#70d6c7','Vidify','https://player.vidify.top/embed/movie/{id}','https://player.vidify.top/embed/tv/{id}/{season}/{episode}'],
    ['moose','Moose','#f0c36d','VidCore','https://www.vidcore.org/embed/movie/{id}?autoPlay=true','https://www.vidcore.org/embed/tv/{id}/{season}/{episode}?autoPlay=true'],
    ['seal','Seal','#7eb8ff','VidPlay','https://vidplay.cc/embed/movie/{id}',null],
    ['capybara','Capybara','#c8a87b','Spenflix V4','https://spencerdevs.xyz/movie/{id}','https://spencerdevs.xyz/tv/{id}/{season}/{episode}'],
    ['macaque','Macaque','#ff8b72','VidFast.to','https://vidfast.to/embed/movie/{id}','https://vidfast.to/embed/tv/{id}/{season}/{episode}'],
    ['marten','Marten','#ff8c7a','VidSrc.pm','https://vidsrc.pm/embed/movie/{id}','https://vidsrc.pm/embed/tv/{id}/{season}/{episode}'],
    ['orca','Orca','#7fd7ff','2Embed.skin','https://2embed.skin/embed/movie/{id}','https://2embed.skin/embed/tv/{id}/{season}/{episode}'],
    ['ibex','Ibex','#d2a7ff','2Embed.cc','https://2embed.cc/embed/movie/{id}','https://2embed.cc/embed/tv/{id}/{season}/{episode}'],
    ['yak','Yak','#ffb36b','VidSrc.to','https://vidsrc.to/embed/movie/{id}','https://vidsrc.to/embed/tv/{id}/{season}/{episode}'],
    ['mole','Mole','#76d6bd','VidSrc.cc','https://vidsrc.cc/v2/embed/movie/{id}?autoPlay=false','https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}?autoPlay=false'],
    ['parrot','Parrot','#f28eb5','MoviesAPI.to','https://moviesapi.to/embed/movie/{id}','https://moviesapi.to/embed/tv/{id}/{season}/{episode}'],
    ['swan','Swan','#92e391','VidFast.co','https://vidfast.co/embed/movie/{id}','https://vidfast.co/embed/tv/{id}/{season}/{episode}'],
    ['lemur','Lemur','#8ca7ff','VidFast.pro','https://vidfast.pro/movie/{id}','https://vidfast.pro/tv/{id}/{season}/{episode}'],
    ['goat','Goat','#e5c271','VidSrc.mov','https://vidsrc.mov/embed/movie/{id}','https://vidsrc.mov/embed/tv/{id}/{season}/{episode}'],
    ['puma','Puma','#75c7c2','P-Stream','https://iframe.pstream.org/embed/tmdb-movie-{id}','https://iframe.pstream.org/embed/tmdb-tv-{id}/{season}/{episode}'],
    ['beaver','Beaver','#d59b72','RiveStream','https://www.rivestream.app/embed?type=movie&id={id}','https://www.rivestream.app/embed?type=tv&id={id}&season={season}&episode={episode}'],
    ['ferret','Ferret','#9ccf7a','Frembed','https://frembed.cc/api/film.php?id={id}','https://frembed.cc/api/serie.php?id={id}&sa={season}&epi={episode}'],
    ['wombat','Wombat','#d9a0c8','Hexa','https://api.hexa.watch/movie/{id}','https://api.hexa.watch/tv/{id}/{season}/{episode}'],
    ['jaguar','Jaguar','#f0b86e','VidLink','https://vidlink.pro/movie/{id}','https://vidlink.pro/tv/{id}/{season}/{episode}'],
    ['penguin','Penguin','#7fa7da','VidSrc.su','https://vidsrc.su/embed/movie/{id}','https://vidsrc.su/embed/tv/{id}/{season}/{episode}'],
    ['sloth','Sloth','#a994ca','VidSrc.vip','https://vidsrc.vip/embed/movie/{id}','https://vidsrc.vip/embed/tv/{id}/{season}/{episode}'],
    ['rhino','Rhino','#8ea0a5','PrimeWire','https://www.primewire.tf/embed/movie?tmdb={id}','https://www.primewire.tf/embed/tv?tmdb={id}&season={season}&episode={episode}'],
    ['meerkat','Meerkat','#d7bb74','123Embed','https://play2.123embed.net/movie/{id}','https://play2.123embed.net/tv/{id}/{season}/{episode}'],
    ['panther','Panther','#9a8cff','SmashyStream','https://embed.smashystream.com/playere.php?tmdb={id}','https://embed.smashystream.com/playere.php?tmdb={id}&season={season}&episode={episode}'],
    ['foxhound','Foxhound','#d87979','Flicky','https://flicky.host/embed/movie/?id={id}','https://flicky.host/embed/tv/?id={id}/{season}/{episode}'],
    ['alpaca','Alpaca','#d8bb91','Vidora','https://vidora.su/movie/{id}','https://vidora.su/tv/{id}/{season}/{episode}'],
    ['toucan','Toucan','#71c9a8','EmbedMaster','https://embedmaster.link/movie/{id}','https://embedmaster.link/tv/{id}/{season}/{episode}'],
    ['aardvark','Aardvark','#bf91d7','Cineby','https://cineby.sc/movie/{id}?play=true','https://cineby.sc/tv/{id}/{season}/{episode}?play=true']
  ];

  /* Keep Monkey first, put the original repo's native VidLink path second, then
     all iframe fallbacks. Remove the old duplicate VidLink iframe entry. */
  var sources = [monkey(), nativeVidLink()].concat(defs.filter(function (def) {
    return def[0] !== 'jaguar';
  }).map(embed));

  /* Best-effort popup guard for CinPlayer's own browsing context. Cross-origin
     iframe pages remain isolated by the browser, so native sources are the only
     path that can be truly free of provider UI/ad scripts without sandboxing. */
  try {
    var originalOpen = window.open;
    window.open = function (url, target, features) {
      try {
        var next = new URL(String(url || ''), location.href);
        if (next.origin !== location.origin) return null;
      } catch (_) {
        return null;
      }
      return originalOpen.call(window, url, target, features);
    };
  } catch (_) {}

  /* Warm DNS for every source but only preconnect the first 12. Opening dozens
     of TLS sockets at once is slower than letting the triple queue do its job. */
  var origins = new Set();
  var preconnected = 0;
  sources.forEach(function (source) {
    try {
      var ctx = { id: '1', season: '', episode: '1', params: new URLSearchParams() };
      Promise.resolve(source.resolve(ctx)).then(function (candidate) {
        if (!candidate || !candidate.url) return;
        var origin = new URL(candidate.url).origin;
        if (origins.has(origin)) return;
        origins.add(origin);
        var dns = document.createElement('link');
        dns.rel = 'dns-prefetch'; dns.href = origin; document.head.appendChild(dns);
        if (preconnected++ < 12) {
          var pc = document.createElement('link');
          pc.rel = 'preconnect'; pc.href = origin; pc.crossOrigin = 'anonymous'; document.head.appendChild(pc);
        }
      }).catch(function () {});
    } catch (_) {}
  });

  /* The current shell defines its globals after this file. A microtask upgrades
     that shell to a strict-priority triple queue before Monkey finishes its first
     asynchronous resolve. Three routes warm together; selection remains #1,#2,#3. */
  setTimeout(function () {
    if (typeof window.runFallbackQueue !== 'function') return;
    window.CONCURRENCY = 3;
    if (window.params && !window.params.get('timeout')) window.PROBE_TIMEOUT = 950;

    window.cancelProbes = function () {
      if (!window.activeProbes) return;
      window.activeProbes.forEach(function (probe) {
        try { probe.cancel(); } catch (_) {}
        try { probe.frame.src = 'about:blank'; } catch (_) {}
        try { probe.frame.remove(); } catch (_) {}
      });
      window.activeProbes.clear();
    };

    window.createProbe = function (candidate, adapter, index, token) {
      var frame = document.createElement('iframe');
      frame.className = 'probeFrame';
      frame.setAttribute('allow', 'fullscreen; picture-in-picture; encrypted-media');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'origin-when-cross-origin');
      document.body.appendChild(frame);

      var settled = false, timer = null;
      var probe = { frame: frame, candidate: candidate, adapter: adapter, index: index, token: token };
      probe.cancel = function () {
        clearTimeout(timer); frame.onload = null; frame.onerror = null;
        try { frame.src = 'about:blank'; } catch (_) {}
        try { frame.remove(); } catch (_) {}
      };
      probe.promise = new Promise(function (resolve) {
        function finish(ok, reason) {
          if (settled) return;
          settled = true; clearTimeout(timer); frame.onload = null; frame.onerror = null;
          resolve({ ok: ok, reason: reason, frame: frame, candidate: candidate, adapter: adapter, index: index, token: token, probe: probe });
        }
        frame.onload = function () { finish(true, 'load'); };
        frame.onerror = function () { finish(false, 'iframe error'); };
        timer = setTimeout(function () { finish(false, 'timeout'); }, window.PROBE_TIMEOUT || 950);
        frame.src = candidate.url;
      });
      window.activeProbes.add(probe);
      return probe;
    };

    window.runFallbackQueue = async function (start, token) {
      var cursor = Math.max(0, start);
      while (cursor < window.SOURCES.length) {
        if (token !== window.runToken) return false;
        var indexes = [];
        for (var n = 0; n < 3 && cursor + n < window.SOURCES.length; n++) indexes.push(cursor + n);
        var entries = await Promise.all(indexes.map(function (i) { return window.resolveEntry(i); }));
        if (token !== window.runToken) return false;

        var valid = entries.filter(Boolean);
        var names = valid.map(function (entry) { return entry.adapter.label; });
        if (window.resolveStatus) window.resolveStatus.textContent = names.length ? 'Checking ' + names.join(' + ') : 'Checking sources';
        valid.forEach(function (entry) {
          var row = window.rowFor(entry.adapter.id);
          if (row) row.scrollIntoView({ block: 'nearest' });
        });

        var jobs = entries.map(function (entry) {
          if (!entry) return null;
          if (entry.candidate.type !== 'embed') return { kind: 'native', entry: entry };
          var probe = window.createProbe(entry.candidate, entry.adapter, entry.index, token);
          return { kind: 'embed', entry: entry, probe: probe, promise: probe.promise };
        });

        for (var j = 0; j < jobs.length; j++) {
          if (token !== window.runToken) { window.cancelProbes(); return false; }
          var job = jobs[j];
          if (!job) continue;

          if (job.kind === 'native') {
            var nativeOK = await window.playNative(job.entry.candidate, job.entry.adapter, job.entry.index);
            if (nativeOK) { window.cancelProbes(); return true; }
            window.setState(job.entry.adapter, 'failed');
            continue;
          }

          var result = await job.promise;
          window.activeProbes.delete(job.probe);
          if (token !== window.runToken) {
            try { result.frame.remove(); } catch (_) {}
            window.cancelProbes(); return false;
          }
          if (result.ok) {
            window.promoteEmbed(result);
            window.cancelProbes();
            return true;
          }
          window.setState(result.adapter, 'failed');
          try { result.frame.remove(); } catch (_) {}
          if (typeof window.log === 'function') window.log(result.adapter.label + ' failed · ' + result.reason);
        }

        window.cancelProbes();
        cursor += 3;
      }
      return false;
    };

    window.startAuto = async function (start) {
      if (window.autoRunning) return false;
      window.autoRunning = true;
      window.cancelProbes();
      window.cleanupActive();
      window.resolver.classList.remove('hidden');
      window.mini.classList.remove('visible');

      var token = ++window.runToken;
      var ok = await window.runFallbackQueue(Math.max(0, start || 0), token);
      window.autoRunning = false;
      if (ok) return true;
      if (token !== window.runToken) return false;

      window.cleanupActive();
      window.resolver.classList.add('hidden');
      var fatal = document.getElementById('fatal');
      if (fatal) fatal.style.display = 'flex';
      return false;
    };

    /* Replace the shell's initial one-at-a-time Monkey boot with the new
       three-wide priority window immediately. */
    if (window.autoRunning && window.currentIndex === -1) {
      window.autoRunning = false;
      ++window.runToken;
      window.cancelProbes();
      window.cleanupActive();
      window.startAuto(0);
    }
  }, 0);

  window.CINPLAYER_SOURCE_ADAPTERS = sources;
})();