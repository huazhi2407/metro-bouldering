import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const TABLE = 'gym_tags';

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ tags: {} as Record<string, string[]> });
  }
  try {
    const { data, error } = await supabase.from(TABLE).select('gym_key, tags');
    if (error) {
      console.error('gym-tags GET error:', error);
      return NextResponse.json({ tags: {} as Record<string, string[]> }, { status: 200 });
    }
    const tags: Record<string, string[]> = {};
    (data ?? []).forEach((row: { gym_key: string; tags: string[] | null }) => {
      tags[row.gym_key] = Array.isArray(row.tags) ? row.tags : [];
    });
    return NextResponse.json({ tags });
  } catch (e) {
    console.error('gym-tags GET', e);
    return NextResponse.json({ tags: {} as Record<string, string[]> }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: '後端未設定' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const gymKey = typeof body?.gymKey === 'string' ? body.gymKey.trim() : '';
    const tag = typeof body?.tag === 'string' ? body.tag.trim() : '';
    if (!gymKey || !tag) {
      return NextResponse.json({ error: '缺少 gymKey 或 tag' }, { status: 400 });
    }
    const { data: row } = await supabase.from(TABLE).select('tags').eq('gym_key', gymKey).single();
    const current: string[] = Array.isArray(row?.tags) ? row.tags : [];
    if (current.includes(tag)) {
      return NextResponse.json({ tags: current });
    }
    const nextTags = [...current, tag];
    const { error: upsertError } = await supabase.from(TABLE).upsert(
      { gym_key: gymKey, tags: nextTags },
      { onConflict: 'gym_key' }
    );
    if (upsertError) {
      console.error('gym-tags POST', upsertError);
      return NextResponse.json({ error: '寫入失敗' }, { status: 500 });
    }
    return NextResponse.json({ tags: nextTags });
  } catch (e) {
    console.error('gym-tags POST', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: '後端未設定' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const gymKey = typeof body?.gymKey === 'string' ? body.gymKey.trim() : '';
    const index = typeof body?.index === 'number' ? body.index : -1;
    if (!gymKey || index < 0) {
      return NextResponse.json({ error: '缺少 gymKey 或 index' }, { status: 400 });
    }
    const { data: row } = await supabase.from(TABLE).select('tags').eq('gym_key', gymKey).single();
    const current: string[] = Array.isArray(row?.tags) ? row.tags : [];
    const nextTags = current.filter((_, i) => i !== index);
    if (nextTags.length === 0) {
      await supabase.from(TABLE).delete().eq('gym_key', gymKey);
      return NextResponse.json({ tags: [] });
    }
    const { error: updateError } = await supabase.from(TABLE).upsert(
      { gym_key: gymKey, tags: nextTags },
      { onConflict: 'gym_key' }
    );
    if (updateError) {
      console.error('gym-tags DELETE', updateError);
      return NextResponse.json({ error: '寫入失敗' }, { status: 500 });
    }
    return NextResponse.json({ tags: nextTags });
  } catch (e) {
    console.error('gym-tags DELETE', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
