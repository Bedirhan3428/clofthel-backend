import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect('http://192.168.1.13:23504', 307);
}
