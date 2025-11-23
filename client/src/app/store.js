// --- FILE: client/src/app/store.js ---
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice'; // Import the auth slice

export const store = configureStore({
    reducer: {
        auth: authReducer, // The auth slice is now accessible via state.auth
        // Other reducers will go here (e.g., projects: projectReducer)
    },
});
