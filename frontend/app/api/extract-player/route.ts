import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch the page');
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // trAnimeizle genellikle videoları iframe içinde tutar
    let iframeSrc = $('iframe').first().attr('src');
    
    // Eğer belirli bir class veya id içinde aramak gerekirse:
    // iframeSrc = $('.player-area iframe').attr('src') || iframeSrc;

    if (iframeSrc) {
      // Bazen src "//domain.com/..." şeklinde gelebilir
      if (iframeSrc.startsWith('//')) {
        iframeSrc = 'https:' + iframeSrc;
      } else if (iframeSrc.startsWith('/')) {
        const urlObj = new URL(url);
        iframeSrc = urlObj.origin + iframeSrc;
      }

      return NextResponse.json({ success: true, iframeUrl: iframeSrc });
    }

    return NextResponse.json({ success: false, error: 'No iframe found on the page' }, { status: 404 });
  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
