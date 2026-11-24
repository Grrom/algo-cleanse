# Firefox Add-ons (AMO) Listing: AlgoCleanse

## Name

AlgoCleanse

## Summary (Short Description)

Cleanse YouTube recommendations, collapse clickbait, and remove Shorts.

## Description (Full Description)

AlgoCleanse cleanses your YouTube recommendation algorithm, collapses sensational clickbait, and helps you take control of what you watch.

Tired of shouting thumbnails, exaggerated titles, and low-effort recommendations cluttering your feed? AlgoCleanse filters out sensationalized content without creating a fragile echo chamber:

- **Collapse Clickbait, Don't Hide:** Videos matching clickbait patterns (ALL CAPS, emoji stuffing, bait phrases, sensationalism) are neatly collapsed into small informational cards. You can see why a video was flagged and click "Show anyway" at any time.
- **Remove Shorts:** Remove distracting Shorts shelves from your feed and redirect Shorts links to the standard YouTube video player.
- **Train Your Recommendation Algorithm:** Cleanse recommendations on your Google account directly. Use manual "Not interested" buttons on collapsed cards or enable automated opt-in training for specific categories (capped safely at 40/day). Because this trains YouTube's native algorithm on your account, your mobile app feed improves too!
- **Channel Block & Allow Lists:** Hover over any card to block a channel, automatically sending YouTube's "Don't recommend channel" to clean up your feed. Or whitelist your favorite creators so they are never filtered.
- **Privacy-First:** All blocks and preferences remain strictly on your machine. No account tracking, no IP logging, and zero data selling. Feedback is 100% opt-in.

Take back your attention with AlgoCleanse for YouTube!

## Single-Purpose Statement

AlgoCleanse has a single purpose: to improve the user experience on YouTube by cleansing recommendations, collapsing clickbait videos, and removing Shorts.

## Permission Justifications

### `storage`

Required to store user preferences (strictness levels, category selections, Shorts display toggle), custom channel blocklists/allowlists, and locally cached detection patterns on the user's device.

### `alarms`

Required to schedule periodic background checks every 12 hours to retrieve updated detection pattern rules from the API.

### Content scripts (`*://www.youtube.com/*`)

Required to analyze video titles and metadata on YouTube pages, collapse flagged video cards, remove Shorts components, execute "Not interested" actions the user clicks or has opted into for chosen categories, and execute "Don't recommend channel" when the user blocks a channel.
