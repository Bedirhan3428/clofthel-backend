export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const urlParams = new URL(request.url).searchParams;
    const targetUrl = urlParams.get('url');

    if (!targetUrl) {
      return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
    }

    try {
      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.delete('connection');

      // Apply referrer bypasses
      if (targetUrl.includes('sibnet.ru')) {
        headers.set('referer', 'https://video.sibnet.ru/');
      } else if (targetUrl.includes('optraco.top') || targetUrl.includes('aitrvip.com')) {
        const isAitrVip = targetUrl.includes('aitrvip.com');
        const baseOrigin = isAitrVip ? 'https://aitrvip.com' : 'https://optraco.top';
        let referer = `${baseOrigin}/`;

        try {
          const urlObj = new URL(targetUrl);
          const parts = urlObj.pathname.split('/');
          if (parts.length >= 4) {
            const id1 = parts[2];
            let id2 = parts[3].replace('.m3u8', '').replace('.ts', '');
            if (id2.length > 40) {
              id2 = id2.substring(0, 40);
            }
            referer = `${baseOrigin}/explorer/${id1}/${id2}`;
          }
        } catch (e) {}

        headers.set('referer', referer);
        headers.set('origin', baseOrigin);
      } else if (targetUrl.includes('aitr') || targetUrl.includes('vip')) {
        headers.set('referer', 'https://www.tranimeizle.io/');
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        redirect: 'follow'
      });

      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (e) {
      return new Response("Proxy Error: " + e.message, { status: 500, headers: corsHeaders });
    }
  }
};
