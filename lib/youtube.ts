// YouTube Data API v3 integration
// Handles OAuth, Shorts upload, and channel insights
// Requires Google OAuth with youtube.upload + youtube.readonly scopes

import { supabase } from './supabase';
import { Linking } from 'react-native';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';

// ── OAuth Flow ─────────────────────────────────────────────────────────────────

export function startYouTubeOAuth(redirectUri: string) {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID not set');
  }

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ].join(' ');

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&access_type=offline&prompt=consent`;

  Linking.openURL(url);
}

export async function exchangeYouTubeCode(
  code: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('youtube-oauth', {
      body: { code, companyId },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Video Upload ───────────────────────────────────────────────────────────────

export interface YouTubeUploadParams {
  videoUrl: string; // Public URL of video to upload
  title: string;
  description: string;
  tags?: string[];
  isShort?: boolean; // Marks as YouTube Short
  categoryId?: string; // 22 = People & Blogs, 26 = Howto & Style
}

export async function uploadYouTubeShort(
  companyId: string,
  params: YouTubeUploadParams,
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  try {
    const token = await getAccessToken(companyId);
    if (!token) {
      return { success: false, error: 'YouTube not connected. Go to Settings and connect your YouTube channel.' };
    }

    // Add #Shorts to title/description for YouTube to recognize as Short
    const title = params.isShort !== false && !params.title.includes('#Shorts')
      ? `${params.title} #Shorts`
      : params.title;

    const description = params.isShort !== false
      ? `${params.description}\n\n#Shorts`
      : params.description;

    // Download the video first, then upload
    const videoResp = await fetch(params.videoUrl);
    if (!videoResp.ok) throw new Error('Failed to download video for upload');
    const videoBlob = await videoResp.blob();

    // Resumable upload - Step 1: Initialize
    const initResp = await fetch(
      `${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': videoBlob.size.toString(),
        },
        body: JSON.stringify({
          snippet: {
            title,
            description,
            tags: params.tags || [],
            categoryId: params.categoryId || '22',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initResp.ok) {
      const err = await initResp.json();
      throw new Error(err.error?.message || 'Upload init failed');
    }

    const uploadUrl = initResp.headers.get('location');
    if (!uploadUrl) throw new Error('No upload URL returned');

    // Step 2: Upload the video bytes
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBlob.size.toString(),
      },
      body: videoBlob,
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.json();
      throw new Error(err.error?.message || 'Video upload failed');
    }

    const uploadData = await uploadResp.json();

    return {
      success: true,
      videoId: uploadData.id,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Insights ───────────────────────────────────────────────────────────────────

export interface YouTubeInsights {
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  recentVideos: {
    title: string;
    views: number;
    likes: number;
    publishedAt: string;
  }[];
}

export async function getYouTubeInsights(
  companyId: string,
): Promise<{ data?: YouTubeInsights; error?: string }> {
  try {
    const token = await getAccessToken(companyId);
    if (!token) return { error: 'YouTube not connected' };

    // Get channel stats
    const channelResp = await fetch(
      `${YT_API}/channels?part=statistics,snippet&mine=true`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const channelData = await channelResp.json();
    if (channelData.error) throw new Error(channelData.error.message);

    const channel = channelData.items?.[0];
    if (!channel) return { error: 'No YouTube channel found' };

    const stats = channel.statistics;

    // Get recent videos
    const videosResp = await fetch(
      `${YT_API}/search?part=snippet&forMine=true&type=video&maxResults=10&order=date`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const videosData = await videosResp.json();
    const videoIds = (videosData.items || []).map((v: any) => v.id.videoId).filter(Boolean);

    let recentVideos: YouTubeInsights['recentVideos'] = [];
    if (videoIds.length > 0) {
      const statsResp = await fetch(
        `${YT_API}/videos?part=statistics,snippet&id=${videoIds.join(',')}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      const statsData = await statsResp.json();
      recentVideos = (statsData.items || []).map((v: any) => ({
        title: v.snippet.title,
        views: parseInt(v.statistics.viewCount || '0'),
        likes: parseInt(v.statistics.likeCount || '0'),
        publishedAt: v.snippet.publishedAt,
      }));
    }

    return {
      data: {
        subscriberCount: parseInt(stats.subscriberCount || '0'),
        totalViews: parseInt(stats.viewCount || '0'),
        videoCount: parseInt(stats.videoCount || '0'),
        recentVideos,
      },
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getAccessToken(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from('social_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('company_id', companyId)
    .eq('platform', 'youtube')
    .single();

  if (!data?.access_token) return null;

  // Check if token needs refresh
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    if (!data.refresh_token) return null;

    // Refresh via edge function
    const { data: refreshData } = await supabase.functions.invoke('youtube-oauth', {
      body: { refreshToken: data.refresh_token, companyId },
    });

    return refreshData?.access_token || null;
  }

  return data.access_token;
}

export async function isYouTubeConnected(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('social_connections')
    .select('access_token')
    .eq('company_id', companyId)
    .eq('platform', 'youtube')
    .single();

  return !!data?.access_token;
}
