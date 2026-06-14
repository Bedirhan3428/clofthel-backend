import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
const MOBILE_APP_SECRET = process.env.MOBILE_APP_SECRET || 'mX8!qV2#kL5n*pR9_yM1$wF8&jY3@cB6-sX4%dG8_vH2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Await params per Next.js 15+ requirements
  const resolvedParams = await params;
  const pathArray = resolvedParams.path || [];
  const path = pathArray.join('/');
  
  const { searchParams } = new URL(request.url);
  const searchString = searchParams.toString();
  
  // Backend'in beklediği req.originalUrl örneğin: /api/animes/trending
  const targetPath = `/api/${path}${searchString ? `?${searchString}` : ''}`;
  
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${targetPath}|${timestamp}|${nonce}`;
  
  const signature = crypto.createHmac('sha256', MOBILE_APP_SECRET).update(payload).digest('hex');

  try {
    const res = await fetch(`${API_BASE}${targetPath}`, {
      method: 'GET',
      headers: {
        'x-clofthel-timestamp': timestamp,
        'x-clofthel-nonce': nonce,
        'x-clofthel-signature': signature,
        'Accept': 'application/json',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
