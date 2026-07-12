import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'android';

  let apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/androidV130.1.apk?alt=media&token=a2044c37-9f8b-45fc-af60-0dcb5a7ab436';
  let fileName = 'Clofthel-v1.3.01-arm.apk';

  if (type === 'emulator') {
    apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/emulatorV130.1.apk?alt=media&token=630f77c1-33ef-4092-b132-38a66129bae0';
    fileName = 'Clofthel-v1.3.01-emulator.apk';
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
