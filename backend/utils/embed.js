/**
 * IndieWave Embed Utilities
 * Handles URL detection, validation, and embed ID extraction
 * Supported platforms: YouTube, Spotify (embeds) + Ditto, DistroKid (pre-save links)
 */

const SUPPORTED_PROVIDERS = {
  youtube: {
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be', 'www.youtube.com'],
    patterns: [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/
    ]
  },
  spotify: {
    name: 'Spotify',
    domains: ['open.spotify.com', 'spotify.link', 'spotify.com'],
    patterns: [
      /(?:open\.spotify\.com\/(?:track|album|playlist)\/([a-zA-Z0-9]+))|(?:spotify\.link\/([a-zA-Z0-9]+))/
    ]
  },
  ditto: {
    name: 'Ditto',
    domains: ['ditto.fm'],
    patterns: [
      /ditto\.fm\/([^/?#]+)/
    ]
  },
  distrokid: {
    name: 'DistroKid',
    domains: ['distrokid.com', 'hyperfollow.com'],
    patterns: [
      /(?:distrokid\.com|hyperfollow\.com)\/(.+)/
    ]
  }
};

/**
 * Validates if a URL is HTTPS and from a known domain
 */
function isValidProtocolAndDomain(url, provider) {
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Check against known domains for the provider
    const providerConfig = SUPPORTED_PROVIDERS[provider];
    if (!providerConfig) {
      return false;
    }
    
    const hostname = urlObj.hostname;
    return providerConfig.domains.some(domain => hostname === domain);
  } catch (err) {
    return false;
  }
}

/**
 * Detects the provider and extracts the embed ID from a URL
 * Returns { provider, embedId } or null if not supported
 */
function detectAndExtractEmbed(url) {
  try {
    // Normalize the URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    const urlObj = new URL(normalizedUrl);
    
    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return null;
    }
    
    const hostname = urlObj.hostname;
    
    // YouTube detection
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      for (const pattern of SUPPORTED_PROVIDERS.youtube.patterns) {
        const match = normalizedUrl.match(pattern);
        if (match) {
          const embedId = match[1];
          if (embedId) {
            return {
              provider: 'youtube',
              embedId,
              normalizedUrl
            };
          }
        }
      }
    }
    
    // Spotify detection
    if (hostname.includes('spotify.com') || hostname.includes('spotify.link')) {
      // Extract track/album/playlist ID from path
      const pathMatch = urlObj.pathname.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
      if (pathMatch) {
        return {
          provider: 'spotify',
          embedId: pathMatch[2],
          normalizedUrl
        };
      }
      
      // Handle spotify.link short URLs
      if (hostname.includes('spotify.link')) {
        const linkMatch = urlObj.pathname.match(/^\/([a-zA-Z0-9]+)/);
        if (linkMatch) {
          return {
            provider: 'spotify',
            embedId: linkMatch[1],
            normalizedUrl
          };
        }
      }
    }
    
    // Ditto pre-save link detection (external link only, no iframe)
    if (hostname === 'ditto.fm') {
      const path = urlObj.pathname.replace(/^\//, '');
      if (path) {
        return {
          provider: 'ditto',
          embedId: path,
          normalizedUrl
        };
      }
    }

    // DistroKid / HyperFollow pre-save link detection (external link only, no iframe)
    if (hostname === 'distrokid.com' || hostname === 'hyperfollow.com') {
      const path = urlObj.pathname.replace(/^\//, '');
      if (path) {
        return {
          provider: 'distrokid',
          embedId: path,
          normalizedUrl
        };
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Generates the appropriate embed HTML/iframe for a provider
 * Does NOT execute arbitrary HTML - only generates from validated IDs
 */
function generateEmbedHtml(provider, embedId) {
  if (!embedId) return null;
  
  switch (provider) {
    case 'youtube':
      // Use privacy-enhanced YouTube domain
      return `<iframe width="100%" height="400" src="https://www.youtube-nocookie.com/embed/${embedId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="max-width: 100%; border-radius: 8px;"></iframe>`;
      
    case 'spotify':
      // Spotify embed with required permissions
      return `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${embedId}?utm_source=generator" width="100%" height="352" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;

    // Ditto and DistroKid are pre-save/promotional links only, not embedded players
    case 'ditto':
    case 'distrokid':
      return null;

    default:
      return null;
  }
}

/**
 * Generates a link to the external platform
 */
function generateExternalLink(provider, embedUrl) {
  if (!embedUrl) return null;
  
  const labels = {
    youtube: 'Watch on YouTube',
    spotify: 'Listen on Spotify',
    ditto: 'Ditto Pre-Save',
    distrokid: 'DistroKid Pre-Save'
  };
  
  return {
    label: labels[provider] || 'Open External',
    url: embedUrl
  };
}

module.exports = {
  detectAndExtractEmbed,
  generateEmbedHtml,
  generateExternalLink,
  isValidProtocolAndDomain,
  SUPPORTED_PROVIDERS
};
