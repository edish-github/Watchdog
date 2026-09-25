import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Watchdog — Public Stream Early Warning',
    short_name: 'Watchdog',
    description: 'Check your stream’s 72-hour forecast and report what you see in 30 seconds.',
    start_url: '/observe',
    scope: '/observe',
    display: 'standalone',
    background_color: '#F4F0E8',
    theme_color: '#F4F0E8',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
