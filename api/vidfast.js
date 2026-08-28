'use strict';

/*
  CinPlayer -> VidFast native bridge.

  This endpoint is intentionally a small integration layer. It does not
  scrape or decrypt third-party players. Once the VidFast owner provides the
  authorized backend/code, wire that implementation in here or configure the
  endpoint templates below.

  Supported environment variables:
    VIDFAST_NATIVE_MOVIE_URL
    VIDFAST_NATIVE_TV_URL
    VIDFAST_NATIVE_AUTH

  URL templates may use:
    {id} {season} {episode}

  Example:
    https://backend.example/resolve/movie/{id}
    https://backend.example/resolve/tv/{id}/{season}/{episode}
*/

function fill(template, values) {
  return String(template || '')
    .replaceAll('{id}', encodeURIComponent(values.id || ''))
    .replaceAll('{season}', encodeURIComponent(values.season || '1'))
    .replaceAll('{episode}', encodeURIComponent(values.episode || '1'));
}

function inferType(url, hinted) {
  if (hinted) {
    const value = String(hinted).toLowerCase();
    if (value.includes('hls') || value.includes('m3u8')) return 'hls';
    if (value.includes('dash') || value.includes('mpd')) return 'dash';
    if (value.includes('mp4') || value.includes('video')) return 'mp4';
  }

  const clean = String(url || '').split('?')[0].toLowerCase();
  if (clean.includes('.m3u8') || clean.includes('.m3u')) return 'hls';
  if (clean.includes('.mpd')) return 'dash';
  if (clean.endsWith('.mp4') || clean.endsWith('.m4v') || clean.endsWith('.webm')) return 'mp4';
  return 'hls';
}

function looksLikeMediaUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  return /\.m3u8?(?:$|\?)/i.test(value) || /\.mpd(?:$|\?)/i.test(value) || /\.(?:mp4|m4v|webm)(?:$|\?)/i.test(value);
}

function findMediaUrl(data, depth = 0) {
  if (depth > 6 || data == null) return null;
  if (looksLikeMediaUrl(data)) return data;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findMediaUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof data !== 'object') return null;

  const priorityKeys = [
    'playlist', 'hls', 'manifest', 'stream', 'streamUrl', 'stream_url',
    'url', 'file', 'src', 'source', 'dash', 'mpd'
  ];

  for (const key of priorityKeys) {
    if (!(key in data)) continue;
    const value = data[key];
    if (looksLikeMediaUrl(value)) return value;
    const nested = findMediaUrl(value, depth + 1);
    if (nested) return nested;
  }

  for (const value of Object.values(data)) {
    const found = findMediaUrl(value, depth + 1);
    if (found) return found;
  }

  return null;
}

function normalizeTracks(data) {
  const candidates = [data?.tracks, data?.subtitles, data?.captions, data?.stream?.tracks];
  const input = candidates.find(Array.isArray) || [];

  return input.map((track) => {
    if (typeof track === 'string') return { url: track };
    if (!track || typeof track !== 'object') return null;
    const url = track.url || track.file || track.src;
    if (!url) return null;
    return {
      url,
      label: track.label || track.name || track.lang || track.language || '',
      language: track.lang || track.language || '',
      kind: track.kind || 'subtitles'
    };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }

  const { searchParams } = new URL(req.url, 'http://localhost');
  const id = String(searchParams.get('id') || '').trim();
  const season = String(searchParams.get('s') || '').trim();
  const episode = String(searchParams.get('e') || '1').trim();

  if (!id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'missing id' }));
  }

  const movieTemplate = process.env.VIDFAST_NATIVE_MOVIE_URL;
  const tvTemplate = process.env.VIDFAST_NATIVE_TV_URL;
  const template = season ? tvTemplate : movieTemplate;

  if (!template) {
    res.statusCode = 503;
    return res.end(JSON.stringify({
      error: 'VidFast native backend not connected yet',
      code: 'VIDFAST_BACKEND_NOT_CONNECTED'
    }));
  }

  const upstreamUrl = fill(template, { id, season, episode });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const headers = {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      'User-Agent': 'CinPlayer/1.0'
    };

    if (process.env.VIDFAST_NATIVE_AUTH) {
      headers.Authorization = process.env.VIDFAST_NATIVE_AUTH;
    }

    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    const contentType = upstream.headers.get('content-type') || '';
    let data;

    if (contentType.includes('json')) {
      data = await upstream.json();
    } else {
      const text = await upstream.text();
      try { data = JSON.parse(text); }
      catch (_) { data = { url: text.trim() }; }
    }

    if (!upstream.ok) {
      res.statusCode = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      return res.end(JSON.stringify({
        error: data?.error || data?.message || `VidFast backend returned ${upstream.status}`
      }));
    }

    const url = findMediaUrl(data);
    if (!url) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: 'VidFast backend returned no playable media URL' }));
    }

    return res.end(JSON.stringify({
      provider: 'VidFast Native',
      url,
      type: inferType(url, data?.type || data?.format),
      tracks: normalizeTracks(data)
    }));
  } catch (error) {
    res.statusCode = error?.name === 'AbortError' ? 504 : 502;
    return res.end(JSON.stringify({
      error: error?.name === 'AbortError' ? 'VidFast backend timed out' : (error?.message || 'VidFast backend failed')
    }));
  } finally {
    clearTimeout(timer);
  }
};
