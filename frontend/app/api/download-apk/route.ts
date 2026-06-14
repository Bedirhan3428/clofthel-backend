import { NextResponse } from 'next/server';

export async function GET() {
  const apkUrl = 'https://firebasestorage.googleapis.com/v0/b/sigalmedia.firebasestorage.app/o/app-release.apk?alt=media&token=7e60ce1f-9984-44e7-98f4-5117af8fbc2f';
  
  try {
    const response = await fetch(apkUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch APK: ${response.statusText}`);
    }

    // Headers'ı klonla
    const headers = new Headers(response.headers);
    // İndirme adını zorla (Force download with specific name)
    headers.set('Content-Disposition', 'attachment; filename="Clofthel-v1.2.0.apk"');
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
