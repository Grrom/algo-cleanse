# Privacy Policy for AlgoCleanse

AlgoCleanse is designed with privacy as a foundational principle. Our goal is to give you control over your YouTube experience without compromising your privacy or tracking your browsing behavior.

## Summary

- **Local-First Architecture:** Your personal channel blocks, allowlists, and extension settings reside on your own device and are never sent to our servers.
- **Opt-In Feedback Only:** Anonymous feedback to improve clickbait detection patterns is disabled by default and sent only with your explicit consent.
- **No Personal Identifiers:** We do not collect names, email addresses, Google accounts, cookies, or unique installation identifiers.
- **No IP Storage:** Our servers process requests in memory and never store client IP addresses in database records or logs.
- **Tell-YouTube Actions Stay Private:** Actions like "Not interested" and "Don't recommend channel" interact directly with YouTube through your own browser session; nothing about them is sent to us.
- **No Data Selling:** We do not sell, rent, monetize, or share your data with third parties or data brokers.

## What Is Stored Locally and Synced

AlgoCleanse stores minimal configuration data required for the extension to operate:

- **Extension Settings:** Your preferences, including extension enabled/disabled state, strictness level (`gentle`, `balanced`, `strict`), Shorts visibility, auto "Not interested" toggles and selected categories, "Don't recommend channel on block" toggle, and feedback consent status (`unset`, `granted`, or `denied`).
- **Channel Lists:** Your personal blocked channels (`blockedChannels`) and always-allowed channels (`allowedChannels`).
- **Auto Counters:** Local timestamps and counters tracking the daily cap (maximum 40 per day) and pacing of automated "Not interested" requests.

This information is saved locally using browser storage APIs (`storage.sync` and `storage.local`) on your device. It is never transmitted to our backend servers.

## What Is Fetched from Our Servers

AlgoCleanse periodically fetches updated detection rules:

- **Detection Patterns:** The extension checks for and downloads curated pattern files (`patterns.json`) from our Cloudflare Worker API on startup, upon installation, and every 12 hours.
- **Anonymous Retrieval:** Pattern downloads are standard HTTP GET requests. They do not transmit any browsing activity, user preferences, account details, or identifiers.

## Tell-YouTube Features (Training Your Algorithm)

AlgoCleanse includes features to help train YouTube's recommendation algorithm to stop serving clickbait:

- **Manual "Not interested":** You can click the "Not interested" button on any collapsed video card.
- **Automated "Not interested":** If you explicitly enable automated training for chosen categories, AlgoCleanse automatically submits "Not interested" on matching collapsed videos, paced carefully with a daily cap.
- **"Don't recommend channel":** When you block a channel, AlgoCleanse can automatically trigger YouTube's native "Don't recommend channel" option.

**Important Privacy Guarantees:**

- These actions are performed directly on your active YouTube tab by interacting with YouTube's native web elements and menu options.
- All actions execute within your own browser session under your own Google account, so recommendation improvements apply to your account across devices.
- Nothing about these actions, the videos you flag, or your activity history is ever sent to AlgoCleanse or our backend servers.
- You can review and clear your YouTube feedback history at any time in Google My Activity.
- **Channel blocks are never sent:** Your personal channel blocks and allowlists reflect your personal viewing preferences, not an objective community verdict. They are stored only on your machine and are never sent to our backend or used to generate shared patterns.

## Data Collected via Feedback (Opt-In Only)

AlgoCleanse offers an optional feedback mechanism to help maintain and refine the community detection patterns.

### Consent and Opt-In

- Feedback is strictly **opt-in** and requires explicit user consent.
- Consent is requested on the onboarding welcome page upon installation. You can choose to grant or deny consent.
- If consent is `unset` or `denied`, no feedback is collected, no network requests are sent to the feedback endpoint, and feedback buttons are hidden from the interface.
- You can grant or revoke consent at any time in the popup settings.

### Feedback Payload Fields

When you choose to provide feedback (by clicking "Wrongly filtered?" after showing a video, or "Clickbait?" on an unflagged tile), the extension sends a small JSON payload (under 4 KB) containing only the following fields:

- `kind`: The type of feedback submission (`false_positive` for wrongly filtered videos or `missed` for undetected clickbait).
- `videoId`: The YouTube video identifier (e.g., `dQw4w9WgXcQ`).
- `title`: The video title at the time of the feedback submission.
- `channelHandle`: The YouTube channel handle (e.g., `@creator`), or null if not available.
- `matchedRuleIds`: An array of rule identifiers from the active pattern set that matched the video.
- `score`: The clickbait score calculated by the detection engine.
- `strictness`: Your active strictness setting (`gentle`, `balanced`, or `strict`).
- `patternsRevision`: The revision number of the active pattern rule set used during evaluation.
- `extensionVersion`: The version number of the installed AlgoCleanse extension.
- `browser`: The browser platform name (`chrome` or `firefox`).

No user IDs, IP addresses, viewing history, or other page contents are included in the feedback payload.

## Data Retention

- Feedback submissions stored in our database are retained for a maximum of 24 months to support pattern improvement and regression analysis. After 24 months, feedback entries are deleted.
- Local configuration and settings remain on your device until you remove the extension or clear browser storage.

## Data Sharing and Third Parties

- **No Selling:** We do not sell, rent, trade, or share your data with advertisers, third-party analytics services, or data brokers.
- **Service Providers:** Our backend API and database are hosted on Cloudflare Workers and Cloudflare D1. Data submitted through opt-in feedback is processed strictly to maintain detection patterns.

## Security and IP Privacy

- All communications with our backend use secure HTTPS encryption.
- Cloudflare connecting IP addresses are processed in memory solely for rate limiting (maximum 30 requests per minute per IP) to prevent abuse and denial-of-service attacks.
- Client IP addresses are never logged to persistent storage or stored in our database.

## Contact

If you have questions or concerns about this privacy policy or our privacy practices, please contact us at:

- Email: `privacy@algocleanse.org`
- Project Repository: `https://github.com/Grrom/algo-cleanse`
