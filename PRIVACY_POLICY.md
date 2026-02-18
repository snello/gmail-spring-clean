# Privacy Policy

**Gmail Spring Clean** - Chrome Extension

*Last updated: 18 February 2026*

## 1. Overview

Gmail Spring Clean ("the Extension") is committed to protecting your privacy. This policy explains what data the Extension accesses, how it is used, and how it is stored.

## 2. Data the Extension Accesses

The Extension accesses your Gmail data through the Gmail API with the `gmail.modify` OAuth scope. Specifically, it accesses:

- **Message metadata**: Sender ("From") headers of inbox messages to identify and tally sender domains.
- **Message IDs**: Used to list and batch-modify (trash) messages matching specific criteria.

The Extension does **not** access or read the body content of your emails.

## 3. How Your Data Is Used

Your data is used solely to provide the Extension's core functionality:

- **Scanning**: Message metadata is read to count and rank sender domains by volume.
- **Trashing**: Message IDs are used to move messages to Trash when you choose to trash a domain or purge old promotions.
- **Searching**: A Gmail search URL is opened in your browser when you click "Search" for a domain.

## 4. Data Storage

- **Scan results** (domain names and message counts) are stored locally in Chrome's `chrome.storage.local` to display results between sessions.
- **Ignored domains** are stored locally in `chrome.storage.local` to persist your ignore list.
- **No data is transmitted to any external server**, third party, or remote service. All processing occurs locally in your browser and directly between your browser and Google's Gmail API.

## 5. Authentication

The Extension uses Chrome's built-in `chrome.identity` API to authenticate with your Google account via OAuth 2.0. Your authentication token is managed entirely by Chrome and is never stored or transmitted by the Extension beyond its intended use with the Gmail API.

## 6. Data Sharing

The Extension does **not** share, sell, rent, or transmit your data to any third party. Your Gmail data is never sent anywhere other than back to Google's own API endpoints.

## 7. Data Retention

- Locally stored scan results and ignored domains persist until you clear Chrome's extension storage or uninstall the Extension.
- The Extension does not maintain any external database or server-side storage.

## 8. Permissions

The Extension requires the following Chrome permissions:

| Permission | Purpose |
|---|---|
| `identity` | Authenticate with your Google account via OAuth 2.0 |
| `storage` | Store scan results and ignored domains locally |
| `tabs` | Open Gmail search results in a new tab |
| `host_permissions` (googleapis.com, mail.google.com) | Communicate with the Gmail API |

## 9. Children's Privacy

The Extension is not directed at children under the age of 13 and does not knowingly collect data from children.

## 10. Changes to This Policy

This Privacy Policy may be updated at any time. Continued use of the Extension after changes constitutes acceptance of the revised policy.

## 11. Your Rights

You may at any time:

- Uninstall the Extension to stop all data access.
- Revoke the Extension's OAuth access through your [Google Account permissions](https://myaccount.google.com/permissions).
- Clear locally stored data through Chrome's extension management page.

## 12. Contact

For questions about this Privacy Policy, please open an issue on the project's GitHub repository.
