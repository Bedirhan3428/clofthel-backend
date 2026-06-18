import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'android';

  let apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/android.apk?alt=media&token=37f75d11-fa9d-4a12-b183-b7460b8c3747';
  let fileName = 'Clofthel-v1.3.0-arm64.apk';

  if (type === 'emulator') {
    apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/emulator.apk?alt=media&token=4ab1dec8-cffe-4b1d-a2e2-dc16a03478e6';
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
