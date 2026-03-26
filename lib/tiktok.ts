// TikTok Business API integration
// Handles OAuth, video posting, and insights
// Requires TikTok for Business developer app

import { supabase } from './supabase';
import { Linking } from 'react-native';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

// ── OAuth Flow ─────────────────────────────────────────────────────────────────

export function startTikTokOAuth(redirectUri: string) {
  const clientKey = process.env.EXPO_PUBLIC_TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    throw new Error('EXPO_PUBLIC_TIKTOK_CLIENT_KEY not set. Register at developers.tiktok.com');
  }

  const scopes = [
    'user.info.basic',
    'video.publish',
    'video.upload',
    'video.list',
  ].join(',');

  // PKCE flow for mobile
  const csrfState = Math.random().toString(36).substring(2, 15);
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfState}`;

  Linking.openURL(url);
  return csrfState;
}

export async function exchangeTikTokCode(
  code: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('tiktok-oauth', {
      body: { code, companyId },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Video Publishing ───────────────────────────────────────────────────────────

export interface TikTokPostParams {
  videoUrl: string; // Public URL of the video to post
  caption: string;
  hashtags?: string[];
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function postToTikTok(
  companyId: string,
  params: TikTokPostParams,
): Promise<{ success: boolean; publishId?: string; error?: string }> {
  try {
    const { data: social } = await supabase
      .from('social_connections')
      .select('access_token')
      .eq('company_id', companyId)
      .eq('platform', 'tiktok')
      .single();

    if (!social?.access_token) {
      return { success: false, error: 'TikTok not connected. Go to Settings and connect your TikTok account.' };
    }

    const caption = params.hashtags?.length
      ? `${params.caption} ${params.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : params.caption;

    // Step 1: Initialize video upload from URL
    const initResp = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${social.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: params.disableComment ?? false,
          disable_duet: params.disableDuet ?? false,
          disable_stitch: params.disableStitch ?? false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: params.videoUrl,
        },
      }),
    });

    const initData = await initResp.json();

    if (initData.error?.code !== 'ok' && initData.error?.code) {
      throw new Error(`TikTok API: ${initData.error.message || initData.error.code}`);
    }

    return {
      success: true,
      publishId: initData.data?.publish_id,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Insights ───────────────────────────────────────────────────────────────────

export interface TikTokInsights {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  followerCount: number;
  videoCount: number;
}

export async function getTikTokInsights(
  companyId: string,
): Promise<{ data?: TikTokInsights; error?: string }> {
  try {
    const { data: social } = await supabase
      .from('social_connections')
      .select('access_token')
      .eq('company_id', companyId)
      .eq('platform', 'tiktok')
      .single();

    if (!social?.access_token) {
      return { error: 'TikTok not connected' };
    }

    // Get user info
    const userResp = await fetch(`${TIKTOK_API}/user/info/?fields=follower_count,video_count,likes_count`, {
      headers: { 'Authorization': `Bearer ${social.access_token}` },
    });

    const userData = await userResp.json();
    const user = userData.data?.user;

    // Get recent videos for view counts
    const videoResp = await fetch(`${TIKTOK_API}/video/list/?fields=view_count,like_count,share_count,comment_count&max_count=20`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${social.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const videoData = await videoResp.json();
    const videos = videoData.data?.videos ?? [];

    const totalViews = videos.reduce((s: number, v: any) => s + (v.view_count || 0), 0);
    const totalLikes = videos.reduce((s: number, v: any) => s + (v.like_count || 0), 0);
    const totalShares = videos.reduce((s: number, v: any) => s + (v.share_count || 0), 0);
    const totalComments = videos.reduce((s: number, v: any) => s + (v.comment_count || 0), 0);

    return {
      data: {
        totalViews,
        totalLikes,
        totalShares,
        totalComments,
        followerCount: user?.follower_count ?? 0,
        videoCount: user?.video_count ?? 0,
      },
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function isTikTokConnected(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('social_connections')
    .select('access_token')
    .eq('company_id', companyId)
    .eq('platform', 'tiktok')
    .single();

  return !!data?.access_token;
}
