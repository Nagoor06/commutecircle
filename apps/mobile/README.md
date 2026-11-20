# CommuteCircle for Android

This Android Trusted Web Activity uses Android Browser Helper 2.7.4. It opens the
canonical web app with the same booking, circles, chat, authentication and push
notifications. It replaces the earlier unimplemented Expo proposal; it is not a
separate React Native client. Android 7+ is supported. Compile/target SDK: 36;
Java 17, AGP 8.13.2, Gradle 8.13.

CI builds an installable **debug APK** and an **unsigned release App Bundle**.
These are test artifacts, not Google Play publication or production approval.
Package: `io.github.nagoor06.commutecircle` (debug adds `.debug`). Do not change the
production package after the first Play upload.

## Build and try

Install Java 17 and Android SDK platform 36, set `ANDROID_HOME`, then:

```bash
cd apps/mobile
./gradlew lint assembleDebug bundleRelease
adb install app/build/outputs/apk/debug/app-debug.apk
```

Windows: use `gradlew.bat`. Android Studio can also open this directory. The
Gradle distribution is pinned with its official SHA-256 checksum. The Android
workflow publishes `commutecircle-android` artifacts. Use a current TWA browser,
such as Chrome. CI debug signing is for testing only.

## Signing and website verification

For a signed release, provide all four environment variables to the build:
`CC_ANDROID_KEYSTORE`, `CC_ANDROID_STORE_PASSWORD`, `CC_ANDROID_KEY_ALIAS`,
`CC_ANDROID_KEY_PASSWORD`. Keep the keystore outside Git and back it up securely.
The release is intentionally unsigned until the owner provides the upload key.
Google Play App Signing may use a different certificate from the upload key.

Obtain the **app-signing SHA-256 fingerprint** from Play Console, then run from the
repository root:

```bash
python scripts/android_assetlinks.py --fingerprint 'YOUR:SHA256:FINGERPRINT' --out /tmp/assetlinks.json
```

Publish the result at `https://nagoor06.github.io/.well-known/assetlinks.json`
in the portfolio repository, preserving any existing associations. Do not put it
inside `/commutecircle/`. The app declares the matching web origin. Without this
association, Android safely falls back to a browser Custom Tab, as expected for
CI debug APKs. Never publish a placeholder/debug certificate as the production
fingerprint. Auth0 uses the existing HTTPS callback. No secret belongs in the APK.
Notification delegation is included with explicit permission.

## Before Google Play production

The code is prepared for Android testing. Store release still requires the owner’s
Play Console account, signing, website association, store assets and declarations.
Also complete these product and operations gates before submitting the pilot:

- Implement account-deletion requests and fulfilment inside the app and on a public
  web page, covering Auth0 and associated data. This is not yet implemented.
- Approve/publish the privacy policy, retention/deletion rules and real support
  contact. Complete Data safety from actual features/providers; do not declare that
  no data is collected. Chat is stored and is not end-to-end encrypted.
- Complete driver/safety operations. Keep sandbox fares clearly labelled: current
  checkout does not collect real money.
- Test on a real phone: sign-in/refresh, permission denial/re-enable, background
  messages, notification taps, account switching/sign-out, GPS denial, keyboard,
  back navigation, offline behavior and Android 16 edge-to-edge insets. GPS still
  requires the app to remain open; no background trip tracking was added.
- Complete any required closed testing and Play review. Personal developer
  accounts created after 13 November 2023 currently need at least 12 testers
  continuously opted in for 14 days before applying for production access.

Official references checked for this implementation:

- https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/14151465
