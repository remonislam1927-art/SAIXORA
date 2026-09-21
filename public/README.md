# SAIXORA — branded company site + secure school downloads

This is the updated SAIXORA website with the supplied cropped logo, main company page, existing **376 original JPEG scroll frames**, founder portrait, and a **new Secure Nova download page**. The main page's Secure Nova feature points to `nova-download.html`.

## Folder layout

```text
saixora-secure-release/
  public/                    <-- only this folder is safe for public static assets
    index.html               cinematic scrolling introduction
    main.html                SAIXORA company page
    nova-download.html       PIN-gated Secure Nova page
    nova-download.js         browser UI only; contains no PIN
    contact.html             contact form (previous backend setup still pending)
    privacy.html, terms.html website documents; review before publishing
    assets/frames/           frame_001.jpg ... frame_376.jpg
    assets/saixora-symbol.webp
    assets/saixora-lockup.webp
    ...
  private/downloads/         <-- NOT PUBLIC: put real app releases here
  server.js                  Node 20+ server, no npm dependencies
```

**Important:** Keep the `public` directory and `private` directory separate. Never upload `private/`, `.env` files or `server.js` to GitHub Pages, Firebase Hosting or another public static file host. They would be exposed if published as static files. Static hosting alone cannot protect downloads with a PIN. Deploy the server to a compatible Node host behind HTTPS, or use an equivalent server-side authorization and private object storage setup. Node 20+ required.

## Local testing (Windows PowerShell)

1. Open a terminal inside the extracted `saixora-secure-release` folder.
2. Enter the school PIN securely at the prompt (it is never included in client files):

```powershell
$securePin = Read-Host 'School download PIN' -AsSecureString
$env:NOVA_DOWNLOAD_PIN = [System.Net.NetworkCredential]::new('', $securePin).Password
node server.js
```

3. Visit `http://localhost:8000/index.html` for the frame-by-frame intro or `http://localhost:8000/main.html` for the company page. Open `http://localhost:8000/nova-download.html` for the school download page.
4. Put **your actual, tested release builds** in `private/downloads/` using these exact filenames:
   - `Secure-Nova-Setup.exe`
   - `N-Teachers.apk`
   - `N-Admin.apk`

The page shows **Not uploaded yet** for missing builds. There are **no application installers** in this package; the site does not pretend otherwise. Start with one school and verify installer signing, app access controls, school approval, and device compatibility before sharing releases.

## Production deployment

- Configure `NOVA_DOWNLOAD_PIN` as a private environment variable in your hosting dashboard. **Rotate the PIN before launching:** it has already appeared in this conversation. Never embed it in HTML, JS, or a public source repository.
- Generate a long independent secret, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, and set it as `NOVA_SESSION_SECRET` in your private deployment environment. It must be at least 32 characters.
- Set `NODE_ENV=production`; the server refuses to start without the private PIN and session secret. Serve via **HTTPS** and ensure the public host forwards the correct `Host` header. The auth cookie uses HttpOnly, Secure and SameSite=Strict in production.
- Host `private/downloads/` on a *persistent, private* volume available to your Node server. An ephemeral application container may discard uploaded files on redeploy.
- Restrict app access **inside Secure Nova** with separate individual school credentials and authorization rules. A shared PIN protects installer downloads only, not the application or its data.
- This minimal one-process implementation has in-memory failed-attempt throttling; it is not a production-scale abuse defense across multiple server instances. Add a shared rate limiter and operational monitoring before public advertising or large-scale deployment. You may want separate school accounts and individual download tokens as the business expands.
- Review the privacy and terms pages, obtain appropriate school approval, and have an adult/professional review contracts and policies before launch.

## Contact enquiries

The contact form is **not connected to an inbox yet**. The existing `config.js` + `site.js` still require a separately configured contact service. This update does not claim to send email or silently change your pending backend work.

## Updating an existing Module 2 installation

The **update ZIP** contains modified `public/` website files (without large frames), the new server, and the README. Back up the old site. Create a new folder `saixora-secure-release/public/`, move or copy your existing Module 2 site files and `assets/frames/` into `public/`, and then copy the update ZIP's `public/` files over them. Keep `private/` alongside `public/`, never inside `public/`. Alternatively extract the **complete ZIP** to a new directory.

## Important limits

The supplied design images are still labeled **AI-generated concepts**; they are not customer testimonials or evidence of capabilities not demonstrated. The website's founder photograph is the photo you supplied. The Windows app monitors the OPS Windows environment only, not a separate Android smartboard mode. The 376-frame animation is unchanged; it has not been converted to a video.
