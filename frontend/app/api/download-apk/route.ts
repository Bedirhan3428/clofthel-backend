import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'android';

  let apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/androidV130.apk?alt=media&token=9ace9f66-f4c0-4ec5-8e7f-2032ee9dc1e8';
  let fileName = 'Clofthel-v1.3.0-arm64.apk';

  if (type === 'emulator') {
    apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/emulatorV130.apk?alt=media&token=a6943dfc-23a1-4fc7-9948-397d5a049efc';
    fileName = 'Clofthel-v1.3.0-x86_64.apk';
  }
  
  try {
    const response = await fetch(apkUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch APK: ${response.statusText}`);
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Content-Type', 'application/vnd.android.package-archive');

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("APK Download Error:", error);
    return new NextResponse('APK indirilirken bir sorun oluştu.', { status: 500 });
  }
}
