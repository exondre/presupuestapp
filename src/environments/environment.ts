// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Environment } from '../types/environment';

export const environment: Environment = {
  production: false,
  firebase: {
    apiKey: 'REPLACE_WITH_DEV_FIREBASE_API_KEY',
    authDomain: 'REPLACE_WITH_DEV_FIREBASE_AUTH_DOMAIN',
    projectId: 'REPLACE_WITH_DEV_FIREBASE_PROJECT_ID',
    storageBucket: 'REPLACE_WITH_DEV_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'REPLACE_WITH_DEV_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'REPLACE_WITH_DEV_FIREBASE_APP_ID',
    measurementId: 'OPTIONAL:REPLACE_WITH_DEV_FIREBASE_MEASUREMENT_ID',
  },
  features: {
    authDebugInfo: false,
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
