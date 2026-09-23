import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDK3SS0_IRlG-BcW9pRgRqdG_bvEApwvNw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jop-smart-task-tracker.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jop-smart-task-tracker",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jop-smart-task-tracker.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "993870073171",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:993870073171:web:38ee8ebac6d9fe6ec525a6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
export default app;
