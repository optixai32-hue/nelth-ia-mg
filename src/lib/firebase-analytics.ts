/**
 * Firebase Analytics (web) — exposition de la config publique pour /api/config.
 *
 * Même projet Firebase que le pont d'authentification (ethan-nairah) : quand
 * l'utilisateur active Google Analytics dans la console Firebase, le snippet
 * « Ajouter Firebase à votre application web » fournit une config qui comporte
 * un measurementId (G-…). Cette config est PUBLIQUE par conception (elle est
 * embarquée dans chaque bundle navigateur — une clé web Firebase identifie,
 * elle n'authentifie jamais), donc la servir pre-auth depuis /api/config est
 * sans risque : cela permet à /static/analytics-bridge.js de démarrer Analytics
 * (événements first_visit / session_start / page_view) avant la connexion, sur
 * chaque domaine autorisé (localhost, previews, domaine Vercel) — exactement
 * comme google-bridge.js consomme oauth.providers.google.firebase.
 *
 * Le bloc n'est émis QUE si la clé web ET le measurementId sont configurés :
 * le measurementId est ce qui active le reporting Google Analytics dans la
 * console Firebase ; sans lui, le SDK Analytics resterait muet.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId: string;
}

/** Config Analytics publique (null = pont Analytics inactif). */
export function firebaseAnalyticsConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.FIREBASE_API_KEY ?? '';
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'ethan-nairah';
  const measurementId = process.env.FIREBASE_MEASUREMENT_ID ?? '';
  if (!apiKey || !measurementId) return null;
  return {
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    ...(process.env.FIREBASE_STORAGE_BUCKET ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET } : {}),
    ...(process.env.FIREBASE_MESSAGING_SENDER_ID
      ? { messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID }
      : {}),
    ...(process.env.FIREBASE_APP_ID ? { appId: process.env.FIREBASE_APP_ID } : {}),
    measurementId,
  };
}
