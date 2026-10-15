/**
 * Spotus Lantern - Spotify Web API PKCE & Album Palette Engine
 * Handles client-side Spotify OAuth with PKCE, currently playing track polling,
 * and high-speed HTML5 Canvas album artwork color extraction.
 */

class SpotusSpotifyManager {
  constructor() {
    this.clientId = localStorage.getItem('spotus_spotify_client_id') || '';
    this.accessToken = localStorage.getItem('spotus_spotify_access_token') || '';
    this.tokenExpiry = parseInt(localStorage.getItem('spotus_spotify_token_expiry') || '0', 10);
    this.pollInterval = null;
    this.currentTrack = null;
    this.palette = [
      { r: 29, g: 185, b: 84 },  // Spotify Green default
      { r: 0, g: 242, b: 254 },  // Cyan default
      { r: 157, g: 78, b: 221 }  // Purple default
    ];

    // Callbacks
    this.onTrackChange = null;
    this.onPaletteExtracted = null;
    this.onAuthStatusChange = null;

    // Check if returning from Spotify OAuth redirect
    this._checkAuthRedirect();
  }

  isAuthorized() {
    return !!(this.accessToken && Date.now() < this.tokenExpiry);
  }

  setClientId(id) {
    this.clientId = id.trim();
    localStorage.setItem('spotus_spotify_client_id', this.clientId);
  }

  /**
   * Spotify PKCE OAuth Login
   */
  async loginWithSpotify() {
    if (!this.clientId) {
      throw new Error('Please enter your Spotify Developer Client ID in Settings first.');
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = 'user-read-playback-state user-read-currently-playing';

    // Generate Code Verifier & Challenge
    const codeVerifier = this._generateRandomString(64);
    const codeChallenge = await this._generateCodeChallenge(codeVerifier);

    localStorage.setItem('spotus_spotify_verifier', codeVerifier);
    localStorage.setItem('spotus_spotify_redirect', redirectUri);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scope,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri
    }).toString();

    window.location.href = authUrl.toString();
  }

  async _checkAuthRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return;

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);

    const codeVerifier = localStorage.getItem('spotus_spotify_verifier');
    const redirectUri = localStorage.getItem('spotus_spotify_redirect') || (window.location.origin + window.location.pathname);

    if (!codeVerifier || !this.clientId) return;

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        })
      });

      const data = await response.json();
      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        localStorage.setItem('spotus_spotify_access_token', this.accessToken);
        localStorage.setItem('spotus_spotify_token_expiry', this.tokenExpiry.toString());
        localStorage.removeItem('spotus_spotify_verifier');

        if (typeof this.onAuthStatusChange === 'function') {
          this.onAuthStatusChange(true);
        }
        this.startPolling();
      }
    } catch (err) {
      console.error('Spotify token exchange failed:', err);
    }
  }

  logout() {
    this.accessToken = '';
    this.tokenExpiry = 0;
    localStorage.removeItem('spotus_spotify_access_token');
    localStorage.removeItem('spotus_spotify_token_expiry');
    this.stopPolling();
    if (typeof this.onAuthStatusChange === 'function') {
      this.onAuthStatusChange(false);
    }
  }

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.fetchCurrentTrack();
    this.pollInterval = setInterval(() => this.fetchCurrentTrack(), 2500);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async fetchCurrentTrack() {
    if (!this.isAuthorized()) return;

    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      if (res.status === 204 || res.status === 404) {
        // Nothing currently playing
        return;
      }

      if (res.status === 401) {
        // Token expired
        this.logout();
        return;
      }

      const data = await res.json();
      if (data && data.item) {
        const trackId = data.item.id;
        const albumImg = data.item.album.images && data.item.album.images[0] ? data.item.album.images[0].url : '';
        const title = data.item.name;
        const artist = data.item.artists.map(a => a.name).join(', ');
        const isPlaying = data.is_playing;
        const progressMs = data.progress_ms;
        const durationMs = data.item.duration_ms;

        // Check if track changed to extract colors
        const trackChanged = !this.currentTrack || this.currentTrack.id !== trackId;

        this.currentTrack = {
          id: trackId,
          title,
          artist,
          albumArt: albumImg,
          isPlaying,
          progressMs,
          durationMs
        };

        if (typeof this.onTrackChange === 'function') {
          this.onTrackChange(this.currentTrack);
        }

        if (trackChanged && albumImg) {
          this.extractAlbumPalette(albumImg);
        }
      }
    } catch (e) {
      // Polling network error
    }
  }

  /**
   * Load mock demo track for testing without Spotify account
   */
  loadDemoTrack() {
    this.currentTrack = {
      id: 'demo-midnight-pulse',
      title: 'Midnight Resonance',
      artist: 'Synthwave Soundscapes',
      albumArt: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=80',
      isPlaying: true,
      progressMs: 45000,
      durationMs: 210000
    };

    // Preset cyberpunk neon palette
    this.palette = [
      { r: 254, g: 0, b: 118 },   // Neon Magenta
      { r: 0, g: 242, b: 254 },   // Electric Cyan
      { r: 29, g: 185, b: 84 }    // Spotify Emerald
    ];

    if (typeof this.onTrackChange === 'function') {
      this.onTrackChange(this.currentTrack);
    }
    if (typeof this.onPaletteExtracted === 'function') {
      this.onPaletteExtracted(this.palette);
    }
  }

  /**
   * Extract top 3 vibrant dominant colors from album art image using Canvas
   */
  extractAlbumPalette(imageUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0, 64, 64);

        const imgData = ctx.getImageData(0, 0, 64, 64).data;
        const colorBuckets = {};

        // Sample pixels with quantization
        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;

          // Skip near black or washed out white
          if (brightness < 25 || brightness > 235) continue;

          // Quantize to 32-step buckets
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          colorBuckets[key] = (colorBuckets[key] || 0) + 1;
        }

        const sorted = Object.keys(colorBuckets).sort((a, b) => colorBuckets[b] - colorBuckets[a]);
        const extracted = [];

        for (const k of sorted) {
          const [r, g, b] = k.split(',').map(Number);
          extracted.push({ r, g, b });
          if (extracted.length >= 3) break;
        }

        if (extracted.length > 0) {
          while (extracted.length < 3) {
            extracted.push({ ...extracted[0] });
          }
          this.palette = extracted;
          if (typeof this.onPaletteExtracted === 'function') {
            this.onPaletteExtracted(this.palette);
          }
        }
      } catch (err) {
        console.warn('Could not extract image colors due to CORS restrictions.');
      }
    };
  }

  _generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
  }

  async _generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}

// Global instance
window.spotusSpotify = new SpotusSpotifyManager();
