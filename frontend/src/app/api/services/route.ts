import { NextResponse } from 'next/server';
import { publicRegistry } from '@/lib/services/registry';

export async function GET() {
  try {
    return NextResponse.json({ services: publicRegistry() });
  } catch {
    return NextResponse.json({ error: 'failed to load services' }, { status: 500 });
  }
}
