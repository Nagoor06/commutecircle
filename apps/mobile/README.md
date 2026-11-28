# CommuteCircle for Android

The Android client uses React Native 0.85.3, Expo SDK 56, React 19 and TypeScript. Its signed preview APK includes the Hermes bundle and opens the booking screen offline. Browsing live rides, sign-in, bookings, messages and verification need a network connection. Website accounts and rides carry over through the shared API. Sign in once in the Android app, which keeps its own credentials in Android secure storage.

## Run or build

Use Node 24 and Java 17. Android builds also need the SDK and NDK versions requested by Gradle. Run from `apps/mobile` on macOS or Linux.

```sh
npm ci
npm run typecheck
npm test
export CC_MOBILE_VARIANT=preview
npm run prebuild:android
NODE_ENV=production ./android/gradlew -p android :app:assembleRelease
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The npm prebuild script pins and verifies Expo's Android template. Android Studio can open the generated `android/` project. For development, run `npm run android` with the same variant after prebuild. On Windows, set the environment variable in PowerShell and use `android\gradlew.bat -p android`.

The preview package is `io.github.nagoor06.commutecircle.preview`. The **Android preview** workflow installs the standalone APK on an Android 16 emulator and checks a cold start in airplane mode, map pin selection, the menu and Android Back on a 360 dp screen, signed-out Inbox, reopening and automatic map recovery after airplane mode. The emulator enters two Bengaluru stops offline, checks for real street features after reconnecting and reports whether driving directions were available. Its artifacts include the APK and startup screenshots.

## App flows

- Browse public rides, use approximate current pickup with permission, or enter public stops manually. Worldwide suggestions use a location bias and sort by distance when an anchor is available.
- Book, Trips and Inbox are the three primary tabs. The header menu opens offers, private circles, weekly rides and profile verification.
- The native MapLibre map shows routes on Book, Offer and Ride details. Expand it to pan, zoom and pick either endpoint on Book or Offer. A bundled [Natural Earth land outline](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/) works offline. [OpenFreeMap](https://openfreemap.org/) supplies street detail, and OSRM supplies the driving geometry when available. The dashed line represents a direct connection. A name without coordinates can still be searched.
- Open an upcoming offer under My trips and choose **Repeat this route**. Weekly schedules preserve the route’s visibility, use an approved vehicle and the pilot’s India time zone. In **Menu → Recurring rides**, generate the next 14 days or skip a date.
- Request approval after accepting the pickup and fare. Review held or paid tickets, sandbox checkout and cancellation fees. Drivers can approve requests and verify boarding PINs.
- Choose **Someone else** on a public ride to book for a guest with their permission. The booking account manages the receipt and passes pickup details and any boarding PIN to the traveller. The option appears when the connected API supports guest bookings.
- Submit driver and vehicle details for staff review. Approved drivers can publish public or circle-only rides.
- Create and join circles, copy a token or share a private invitation. Confirmed participants can chat. Unread badges and foreground alerts link to the relevant conversation.
- Submit private safety reports. Trip sharing and tracking, staff tools and browser push settings are available on the website. Website notification subscriptions belong to the browser. Android remote push requires separate device registration and delivery.

## Authentication

The app obtains its public Auth0 client configuration from the API. It opens the system browser for Authorization Code with PKCE. The registered HTTPS callback shows **Open CommuteCircle** and returns the single-use code to the matching app variant. The verifier and rotating credentials stay in secure storage. The preview and production packages keep separate sessions. A temporary refresh outage preserves the saved session. Account changes clear private screens.

## Play bundle

Generate the production Android project with `CC_MOBILE_VARIANT=production npm run prebuild:android`, then build with `NODE_ENV=production ./android/gradlew -p android :app:bundleRelease` with the same variant. The Play application ID is `io.github.nagoor06.commutecircle`. CI produces an unsigned App Bundle. For owner-signed releases, supply `CC_ANDROID_KEYSTORE` (absolute path), `CC_ANDROID_STORE_PASSWORD`, `CC_ANDROID_KEY_ALIAS` and `CC_ANDROID_KEY_PASSWORD` to Gradle through protected build secrets.

Before Play submission, complete account-deletion handling, the public privacy policy and support details, Play Console disclosures and testing, and real-device sign-in and notification checks. Fares remain sandbox transactions.
