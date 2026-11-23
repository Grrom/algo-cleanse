import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractVideo } from '../../../src/platforms/youtube/extract';
import { SELECTORS } from '../../../src/platforms/youtube/selectors';

describe('fixtures extractVideo', () => {
  // For each fixture, extractVideo returns expected videoId, title, channelHandle per tile
  it('For each fixture, extractVideo returns expected videoId, title, channelHandle per tile', () => {
    // 1. Home Grid fixture
    const homeHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/home-grid.html'),
      'utf-8',
    );
    expect(homeHtml).toMatch(/^<!DOCTYPE html>/i);

    const homeContainer = document.createElement('div');
    homeContainer.innerHTML = homeHtml;
    const homeTiles = Array.from(
      homeContainer.querySelectorAll(SELECTORS.tile),
    ).filter(
      (el) => !el.parentElement || !el.parentElement.closest(SELECTORS.tile),
    );

    expect(homeTiles.length).toBe(3);

    const homeTile1 = homeTiles[0]!;
    const homeVideo1 = extractVideo(homeTile1);
    expect(homeVideo1).toEqual({
      videoId: 'homeVid001',
      title: 'Building a Modern Extension from Scratch',
      channelHandle: '@devmastery',
      channelName: 'Dev Mastery',
      durationText: '14:20',
      isShort: false,
    });

    const homeTile2 = homeTiles[1]!;
    const homeVideo2 = extractVideo(homeTile2);
    expect(homeVideo2).toEqual({
      videoId: 'homeVid002',
      title: 'Why Clean Architecture Matters in 2026',
      channelHandle: '@architecturelab',
      channelName: 'Architecture Lab',
      durationText: '21:05',
      isShort: false,
    });

    const homeTile3 = homeTiles[2]!;
    const homeVideo3 = extractVideo(homeTile3);
    expect(homeVideo3).toEqual({
      videoId: 'homeVid003',
      title: 'Understanding React 19 and Web Components',
      channelHandle: '@frontendguru',
      channelName: 'Frontend Guru',
      durationText: '09:42',
      isShort: false,
    });

    // 2. Search fixture
    const searchHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/search.html'),
      'utf-8',
    );
    expect(searchHtml).toMatch(/^<!DOCTYPE html>/i);

    const searchContainer = document.createElement('div');
    searchContainer.innerHTML = searchHtml;
    const searchTiles = Array.from(
      searchContainer.querySelectorAll(SELECTORS.tile),
    );
    expect(searchTiles.length).toBe(2);

    const searchTile1 = searchTiles[0]!;
    const searchVideo1 = extractVideo(searchTile1);
    expect(searchVideo1).toEqual({
      videoId: 'searchVid001',
      title: 'Full TypeScript Masterclass for Beginners',
      channelHandle: '@typescriptpro',
      channelName: 'TypeScript Pro',
      durationText: '45:12',
      isShort: false,
    });

    const searchTile2 = searchTiles[1]!;
    const searchVideo2 = extractVideo(searchTile2);
    expect(searchVideo2).toEqual({
      videoId: 'searchVid002',
      title: '10 Tips for Writing Reliable Unit Tests',
      channelHandle: '@testinghq',
      channelName: 'Testing HQ',
      durationText: '18:30',
      isShort: false,
    });

    // 3. Sidebar fixture
    const sidebarHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/sidebar.html'),
      'utf-8',
    );
    expect(sidebarHtml).toMatch(/^<!DOCTYPE html>/i);

    const sidebarContainer = document.createElement('div');
    sidebarContainer.innerHTML = sidebarHtml;
    const sidebarTiles = Array.from(
      sidebarContainer.querySelectorAll(SELECTORS.tile),
    );
    expect(sidebarTiles.length).toBe(2);

    const sidebarTile1 = sidebarTiles[0]!;
    const sidebarVideo1 = extractVideo(sidebarTile1);
    expect(sidebarVideo1).toEqual({
      videoId: 'sidebarVid001',
      title: 'Next-Level Algorithms You Must Know',
      channelHandle: '@algoking',
      channelName: 'Algo King',
      durationText: '11:58',
      isShort: false,
    });

    const sidebarTile2 = sidebarTiles[1]!;
    const sidebarVideo2 = extractVideo(sidebarTile2);
    expect(sidebarVideo2).toEqual({
      videoId: 'sidebarVid002',
      title: 'CSS Grid and Flexbox Complete Guide',
      channelHandle: '@csstricksdaily',
      channelName: 'CSS Tricks Daily',
      durationText: '16:40',
      isShort: false,
    });

    // 4. Shorts shelf fixture
    const shortsHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/shorts-shelf.html'),
      'utf-8',
    );
    expect(shortsHtml).toMatch(/^<!DOCTYPE html>/i);

    const shortsContainer = document.createElement('div');
    shortsContainer.innerHTML = shortsHtml;
    const shortsTiles = Array.from(
      shortsContainer.querySelectorAll(SELECTORS.tile),
    );
    expect(shortsTiles.length).toBe(2);

    const shortTile1 = shortsTiles[0]!;
    const shortVideo1 = extractVideo(shortTile1);
    expect(shortVideo1).toEqual({
      videoId: 'shortVid001',
      title: 'Quick Python Trick You Never Knew #shorts',
      channelHandle: '@quickcoder',
      channelName: 'Quick Coder',
      durationText: null,
      isShort: true,
    });

    const shortTile2 = shortsTiles[1]!;
    const shortVideo2 = extractVideo(shortTile2);
    expect(shortVideo2).toEqual({
      videoId: 'shortVid002',
      title: 'CSS One-Liner That Replaces 50 Lines of JS',
      channelHandle: '@webdevdaily',
      channelName: 'Web Dev Daily',
      durationText: null,
      isShort: true,
    });
  });
});
