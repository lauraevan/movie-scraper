'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const net = require('net');

const REFERER = 'https://vidlink.pro/';
const ORIGIN = 'https://vidlink.pro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';
const TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

let bootPromise = null;

function bootWasm() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    globalThis.window = globalThis;
    globalThis.self = globalThis;
    globalThis.document = {
      createElement: () => ({}),
      body: { appendChild: () => {} }
    };

    const sodium = require('libsodium-wrappers');
    await sodium.ready;
    globalThis.sodium = sodium;

    eval(fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'));

    const go = new Dm();
    const wasmBuf = fs.readFileSync(path.join(__dirname, 'fu.wasm'));
    const { instance } = await WebAssembly.instantiate(wasmBuf, go.importObject);
    go.run(instance);

    await new Promise(resolve => setTimeout(resolve, 500));

    if (typeof globalThis.getAdv !== 'function') {
      throw new Error('getAdv not found after WASM boot');
    }
  })();

  return bootPromise;
}

async function getStream(id, season, episode) {
  await bootWasm();

  const token = globalThis.getAdv(String(id));
  if (!token) throw new Error('getAdv returned null');

  const apiUrl = season
    ? `https://vidlink.pro/api/b/tv/${token}/${season}/${episode || 1}?multiLang=0`
    : `https://vidlink.pro/api/b/movie/${token}?multiLang=0`;

  const response = await fetch(apiUrl, {
    headers: {
      Referer: REFERER,
      Origin: ORIGIN,
      'User-Agent': UA,
      Accept: 'application/json,*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`resolver returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const playlist = data?.stream?.playlist;

  if (!playlist) {
    throw new Error('resolver response did not include a playlist');
  }

  return playlist;
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n))) return false;

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function validateProxyUrl(raw) {
  const target = new URL(raw);

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('unsupported proxy protocol');
  }

  const hostname = target.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('local proxy targets are blocked');
  }

  const ipType = net.isIP(hostname);
  if (ipType === 4 && isPrivateIPv4(hostname)) {
    throw new Error('private proxy targets are blocked');
  }
  if (ipType === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:'))) {
    throw new Error('private proxy targets are blocked');
  }

  return target;
}

function fetchUpstream(rawUrl, requestHeaders = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));

    let target;
    try {
      target = validateProxyUrl(rawUrl);
    } catch (error) {
      return reject(error);
    }

    const client = target.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': UA,
      Accept: requestHeaders.accept || '*/*',
      Referer: REFERER,
      Origin: ORIGIN
    };

    if (requestHeaders.range) headers.Range = requestHeaders.range;
    if (requestHeaders['if-none-match']) headers['If-None-Match'] = requestHeaders['if-none-match'];
    if (requestHeaders['if-modified-since']) headers['If-Modified-Since'] = requestHeaders['if-modified-since'];

    const request = client.get(target, { headers }, response => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        const next = new URL(response.headers.location, target).href;
        return resolve(fetchUpstream(next, requestHeaders, redirects + 1));
      }

      resolve({ response, finalUrl: target.href });
    });

    request.setTimeout(20000, () => {
      request.destroy(new Error('upstream request timed out'));
    });

    request.on('error', reject);
  });
}

function proxiedUrl(absoluteUrl) {
  return '/api?url=' + encodeURIComponent(absoluteUrl);
}

function makeAbsolute(value, baseUrl) {
  return new URL(value, baseUrl).href;
}

function rewriteTagUris(line, baseUrl) {
  return line.replace(/URI=("([^"]+)"|'([^']+)')/gi, (match, quoted, doubleValue, singleValue) => {
    const value = doubleValue || singleValue;
    const quote = quoted[0];
    const absolute = makeAbsolute(value, baseUrl);
    return `URI=${quote}${proxiedUrl(absolute)}${quote}`;
  });
}

/* HLS can advertise out-of-band interstitials with EXT-X-DATERANGE. The native
   CinPlayer path has no reason to hand those ad assets to a provider player, so
   remove only explicit interstitial directives. Normal movie segments are left
   untouched. */
function stripHlsInterstitials(body) {
  return body
    .split(/\r?\n/)
    .filter(line => {
      const upper = line.trim().toUpperCase();
      if (!upper.startsWith('#EXT-X-DATERANGE:')) return true;

      return !(
        upper.includes('COM.APPLE.HLS.INTERSTITIAL') ||
        upper.includes('X-ASSET-URI=') ||
        upper.includes('X-ASSET-LIST=')
      );
    })
    .join('\n');
}

function rewriteM3u8(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return rewriteTagUris(line, baseUrl);
      }

      const absolute = makeAbsolute(trimmed, baseUrl);
      return proxiedUrl(absolute);
    })
    .join('\n');
}

function copyHeader(upstream, res, name, outputName = name) {
  const value = upstream.headers[name.toLowerCase()];
  if (value !== undefined) res.setHeader(outputName, value);
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range,If-None-Match,If-Modified-Since,Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges,Content-Length,Content-Range,Content-Type,ETag,Last-Modified');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  const { searchParams } = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(searchParams);

  if (q.health === '1') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      ok: true,
      service: 'movie-scraper',
      proxy: true,
      testStream: TEST_STREAM
    }));
  }

  if (q.test === '1') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      url: TEST_STREAM,
      test: true
    }));
  }

  if (q.url) {
    let decoded;
    try {
      decoded = decodeURIComponent(q.url);
      validateProxyUrl(decoded);
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: error.message }));
    }

    try {
      const { response: upstream, finalUrl } = await fetchUpstream(decoded, req.headers);
      const contentType = String(upstream.headers['content-type'] || '').toLowerCase();
      const isM3u8 =
        contentType.includes('mpegurl') ||
        contentType.includes('m3u8') ||
        /\.m3u8(?:$|\?)/i.test(finalUrl);

      res.statusCode = upstream.statusCode || 200;

      copyHeader(upstream, res, 'accept-ranges');
      copyHeader(upstream, res, 'content-range');
      copyHeader(upstream, res, 'etag');
      copyHeader(upstream, res, 'last-modified');
      copyHeader(upstream, res, 'cache-control');

      if (isM3u8) {
        const chunks = [];
        for await (const chunk of upstream) chunks.push(chunk);

        const body = Buffer.concat(chunks).toString('utf8');
        const cleaned = stripHlsInterstitials(body);
        const rewritten = rewriteM3u8(cleaned, finalUrl);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');

        if (req.method === 'HEAD') return res.end();
        return res.end(rewritten);
      }

      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      copyHeader(upstream, res, 'content-length');

      if (req.method === 'HEAD') {
        upstream.resume();
        return res.end();
      }

      upstream.pipe(res);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: error.message }));
    }

    return;
  }

  if (!q.id) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      error: 'missing id',
      hint: 'Use ?id=550 or ?test=1'
    }));
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const url = await getStream(q.id, q.s, q.e);
    return res.end(JSON.stringify({ url }));
  } catch (error) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      error: error.message,
      stage: 'resolver'
    }));
  }
};