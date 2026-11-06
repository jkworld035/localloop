import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One app, three role-based experiences (customer, vendor, delivery partner).
 * Secrets never live here: public keys come from EXPO_PUBLIC_* env vars
 * (apps/mobile/.env, or EAS environment variables for cloud builds), and the
 * Google Maps SDK keys are restricted to this app's bundle id / SHA-1.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const suffix = IS_DEV ? '.dev' : IS_PREVIEW ? '.preview' : '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'LocalLoop (Dev)' : IS_PREVIEW ? 'LocalLoop (Preview)' : 'LocalLoop',
  slug: 'localloop',
  scheme: 'localloop',
  // Store version shown to users. Build numbers (versionCode / buildNumber) are
  // managed by EAS (appVersionSource: remote, autoIncrement on production).
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: `in.localloop.app${suffix}`,
    supportsTablet: false,
    config: { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'LocalLoop uses your location to show shops near you and to set your delivery address.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Delivery partners: LocalLoop shares your location with the customer and shop only during an active delivery, including when the app is in the background.',
      NSCameraUsageDescription: 'LocalLoop uses the camera to photograph products, your shop and verification documents.',
      NSPhotoLibraryUsageDescription: 'LocalLoop lets you choose photos of products, your shop and verification documents.',
      UIBackgroundModes: ['location', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: `in.localloop.app${suffix}`,
    adaptiveIcon: {
      backgroundColor: '#174C38',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION', // delivery partners only; requested at "go online"
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'CAMERA',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-localization',
    'expo-secure-store',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, resizeMode: 'contain', backgroundColor: '#174C38' },
    ],
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-notifications',
      { color: '#174C38', defaultChannel: 'orders' },
    ],
    [
      'expo-image-picker',
      { photosPermission: 'LocalLoop lets you choose photos of products, your shop and verification documents.' },
    ],
    ['expo-build-properties', { android: { minSdkVersion: 26 }, ios: { deploymentTarget: '16.4' } }],
  ],
  extra: {
    eas: { projectId: (process.env.EAS_PROJECT_ID ?? 'e0292ea8-6ed9-435d-b854-0e8c0e448b7e') },
  },
  updates: (process.env.EAS_PROJECT_ID ?? 'e0292ea8-6ed9-435d-b854-0e8c0e448b7e') ? { url: `https://u.expo.dev/${(process.env.EAS_PROJECT_ID ?? 'e0292ea8-6ed9-435d-b854-0e8c0e448b7e')}` } : undefined,
});
