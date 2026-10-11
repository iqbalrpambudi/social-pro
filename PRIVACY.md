# Privacy Policy for Social Pro

**Last Updated:** October 2026

**Social Pro** ("we", "our", or "the Application") values your privacy. This Privacy Policy explains how your information is handled when using our media publishing tool.

---

### 1. Information We Access and Collect
When you connect third-party platforms (such as YouTube or TikTok) to Social Pro, the Application accesses only the minimal permissions required to provide publishing services:
- **Account Profiles:** Basic display name, channel/profile ID, and avatar URL to identify connected channels in the user interface.
- **OAuth Authentication Tokens:** Access and refresh tokens necessary to authenticate API requests on your behalf.
- **Uploaded Media & Metadata:** Video files, titles, descriptions, tags, and privacy settings you choose to publish.

---

### 2. How Information Is Stored and Protected
- **Local / Self-Hosted Storage:** All media assets and configuration databases reside in your designated private infrastructure (PostgreSQL database and MinIO/S3 object storage).
- **Token Encryption:** OAuth credentials and sensitive tokens are encrypted at rest using industry-standard **AES-256-GCM** encryption.
- **No Third-Party Data Selling:** We do not sell, rent, monetize, or share your data or uploaded media with any external advertising networks or data brokers.

---

### 3. Use of Third-Party API Services
Social Pro interacts directly with official third-party APIs:
- **TikTok API Services:** When you publish to TikTok, media and metadata are transmitted directly to TikTok's Content Posting API v2. For information on how TikTok processes your data, review the [TikTok Privacy Policy](https://www.tiktok.com/legal/page/row/privacy-policy/en).
- **Google & YouTube API Services:** Social Pro's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

---

### 4. Data Retention and Revocation
- You can revoke Social Pro's access to your YouTube or TikTok account at any time directly through the "Akun Terhubung" dashboard or via your Google Account Security Settings and TikTok Authorized Apps settings.
- When an account is disconnected in Social Pro, all associated encrypted tokens are permanently purged from the database.

---

### 5. Updates to This Policy
We may update this Privacy Policy from time to time to reflect enhancements or changes in platform requirements. Continued use of Social Pro signifies acceptance of updated terms.

---

### 6. Contact
For any questions regarding this Privacy Policy, please contact the application maintainer.
