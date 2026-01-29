# Gmail Spring Clean (Chrome Extension)

# Disclaimer
This extension is provided as-is and used entirely at your own discretion. You are solely responsible for any actions taken with it and for all resulting outcomes, including message deletion or data loss.

## License
MIT License — you may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies.

## About
Shows which domains have the most messages in your Inbox and lets you trash all emails from a domain at the same time.

## Features
- Scans Inbox messages (pages of 500 IDs) and tallies sender domains.
- Displays a sorted list of domains with counts.
- "Trash domain" button moves all messages from that domain to Trash.
- Ignore button adds a domain to be ignored in the future.
- Search button will launch a gmail window showing you all the emails from that domain.

## Setup
1) In Chrome, visit 'chrome://extensions' and ensure that "Developer Mode" is selected on the top right.
2) Click 'Load Unpacked' in the top left and navigate to the folder containing this file and the other extension related files from the repo. This will generate an extension ID that can be seen in the listing for this extension. You can also see it in the extension 'Details' page.
3) In Google Cloud Console create an OAuth client **Application type: Chrome App**.
   - Application ID = your extension ID from the previous step.
   - Copy the **Client ID** (`...apps.googleusercontent.com`) that is provided once the client is created.
4) Update `manifest.json` → `oauth2.client_id` with that value.
5) Ensure Gmail API is enabled and your Google account is a test user on the OAuth consent screen (this may not be necessary if you operate in an organization account)
6) Ensure that the auth/gmail.modify scope is added under 'Data Access' for oAuth.

## Using
- Click the extension icon (easiest if you pin it to the bar). Then click the 'rescan' button which will begin to build its stats. Adjust "Pages" (each is 500 messages) and click **Rescan** to scan more or fewer messages. **Beware** of rate limits that will be hit with repeated rescans in a short amount of time.
- Click **Trash domain** to move all messages from that domain to Trash (uses `in:anywhere from:domain has:nouserlabels`).
- Click **Ignore** to permanently ignore that domain in future rescans. 
- Click **Search** to open a new tab displaying emails that have been sent from this domain, so that you can review the sorts of messages being sent by that domain.

## Notes
- Scanning many pages can take time because Gmail metadata requires one request per message; concurrency is limited to avoid rate issues.
- The trash button will not delete emails to which you have already applied a label - these are ignored.
