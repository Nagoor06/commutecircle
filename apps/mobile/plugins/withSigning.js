const { withAppBuildGradle } = require('expo/config-plugins');

// Expo's local template signs release builds with its development key. Permit
// that only for the separately named preview app. Store releases use an upload key.
module.exports = (config) =>
  withAppBuildGradle(config, (result) => {
    if (result.extra.preview) return result;
    const source = result.modResults.contents;
    const releaseKey = /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseKey.test(source)) throw new Error('Review the Android release signing template.');
    result.modResults.contents = source
      .replace(
        'signingConfigs {',
        `signingConfigs {
        if (System.getenv('CC_ANDROID_KEYSTORE')) {
            upload {
                storeFile file(System.getenv('CC_ANDROID_KEYSTORE'))
                storePassword System.getenv('CC_ANDROID_STORE_PASSWORD')
                keyAlias System.getenv('CC_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('CC_ANDROID_KEY_PASSWORD')
            }
        }`,
      )
      .replace(
        releaseKey,
        '$1if (System.getenv("CC_ANDROID_KEYSTORE")) signingConfig signingConfigs.upload',
      );
    return result;
  });
