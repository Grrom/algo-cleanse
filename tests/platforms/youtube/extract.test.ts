import { describe, expect, it } from 'vitest';
import { extractVideo } from '../../../src/platforms/youtube/extract';

describe('extractVideo', () => {
  // Tile with no watch/shorts link -> null; /shorts/ link -> isShort: true
  it('Tile with no watch/shorts link -> null; /shorts/ link -> isShort: true', () => {
    // 1. Tile with no watch/shorts link -> null
    const emptyTile = document.createElement('div');
    expect(extractVideo(emptyTile)).toBeNull();

    const nonVideoTile = document.createElement('div');
    nonVideoTile.innerHTML = '<a href="/feed/subscriptions">Subscriptions</a>';
    expect(extractVideo(nonVideoTile)).toBeNull();

    // 2. /shorts/ link -> isShort: true
    const shortsTile = document.createElement('div');
    shortsTile.innerHTML = `
      <a href="/shorts/testShort123">
        <h3 id="video-title">Fun Short</h3>
      </a>
      <a href="/@ShortCreator">Creator</a>
    `;
    const shortsResult = extractVideo(shortsTile);
    expect(shortsResult).not.toBeNull();
    expect(shortsResult?.isShort).toBe(true);
    expect(shortsResult?.videoId).toBe('testShort123');
    expect(shortsResult?.title).toBe('Fun Short');
    expect(shortsResult?.channelHandle).toBe('@shortcreator');

    // 3. /watch?v= link -> isShort: false
    const watchTile = document.createElement('div');
    watchTile.innerHTML = `
      <a href="/watch?v=watchVid999">
        <span id="video-title">Regular Video</span>
      </a>
      <a href="/@WatchCreator">Creator</a>
    `;
    const watchResult = extractVideo(watchTile);
    expect(watchResult).not.toBeNull();
    expect(watchResult?.isShort).toBe(false);
    expect(watchResult?.videoId).toBe('watchVid999');
    expect(watchResult?.title).toBe('Regular Video');
    expect(watchResult?.channelHandle).toBe('@watchcreator');
  });

  it('extracts title from title attribute or trimmed text, handling missing fields as null', () => {
    const tileWithAttr = document.createElement('div');
    tileWithAttr.innerHTML = `
      <a href="/watch?v=attrVid">
        <span id="video-title" title="Title From Attribute">Title From Text</span>
      </a>
    `;
    const resWithAttr = extractVideo(tileWithAttr);
    expect(resWithAttr?.title).toBe('Title From Attribute');
    expect(resWithAttr?.channelHandle).toBeNull();
    expect(resWithAttr?.channelName).toBeNull();
    expect(resWithAttr?.durationText).toBeNull();

    const tileWithText = document.createElement('div');
    tileWithText.innerHTML = `
      <a href="/watch?v=textVid">
        <span id="video-title">   Trimmed Title Text   </span>
      </a>
    `;
    const resWithText = extractVideo(tileWithText);
    expect(resWithText?.title).toBe('Trimmed Title Text');
  });

  it('lowercases channelHandle and preserves leading @', () => {
    const tile = document.createElement('div');
    tile.innerHTML = `
      <a href="/watch?v=handleVid">
        <span id="video-title">Handle Test</span>
      </a>
      <a href="/@UpperCaseChannel_123/featured">Upper Channel</a>
    `;
    const res = extractVideo(tile);
    expect(res?.channelHandle).toBe('@uppercasechannel_123');
  });

  it('handles watch link with missing videoId and malformed links', () => {
    const tileNoV = document.createElement('div');
    tileNoV.innerHTML = '<a href="/watch">No V Param</a>';
    expect(extractVideo(tileNoV)).toBeNull();

    const tileEmptyHref = document.createElement('div');
    tileEmptyHref.innerHTML = '<a href="">Empty</a>';
    expect(extractVideo(tileEmptyHref)).toBeNull();

    // Malformed URLs that throw in new URL() fallback to regex parser
    const tileMalformedWatch = document.createElement('div');
    tileMalformedWatch.innerHTML =
      '<a href="http://[invalid/watch?v=regexWatch123">Fallback</a><a href="/@RegexChannel">Channel</a>';
    const malformedWatchRes = extractVideo(tileMalformedWatch);
    expect(malformedWatchRes?.videoId).toBe('regexWatch123');
    expect(malformedWatchRes?.channelHandle).toBe('@regexchannel');

    const tileMalformedShorts = document.createElement('div');
    tileMalformedShorts.innerHTML =
      '<a href="http://[invalid/shorts/regexShort123">Fallback</a>';
    const malformedShortsRes = extractVideo(tileMalformedShorts);
    expect(malformedShortsRes?.videoId).toBe('regexShort123');
    expect(malformedShortsRes?.isShort).toBe(true);
  });
});
