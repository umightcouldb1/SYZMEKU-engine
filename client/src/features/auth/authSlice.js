// --- FILE: client/src/features/auth/authSlice.js ---
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

axios.defaults.withCredentials = true;

const getStoredUser = () => {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch (_error) {
        localStorage.removeItem('user');
        return null;
    }
};

const getStoredToken = (userData = null) => userData?.token || localStorage.getItem('token') || '';
const getStoredRole = (userData = null) => userData?.role || localStorage.getItem('user_role') || 'user';

const setAuthHeader = (userData = null) => {
    const token = getStoredToken(userData);
    if (token) {
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete axios.defaults.headers.common.Authorization;
    }
};

const persistAuthUser = (userData) => {
    if (!userData) return;
    const token = getStoredToken(userData);
    const role = getStoredRole(userData);

    localStorage.setItem('user', JSON.stringify({ ...userData, token, role }));
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user_role', role);
    setAuthHeader({ ...userData, token });
};

// Get user from localStorage (used for persistence across page reloads)
const user = getStoredUser();
setAuthHeader(user);

const initialState = {
    user: user ? { ...user, token: getStoredToken(user), role: getStoredRole(user) } : null,
    isError: false,
    isSuccess: false,
    isLoading: false,
    message: '',
};

const API_URL = '/api/auth/'; // Base URL for Auth API routes

// --- AUTH SERVICE (API Interaction) ---
const authService = {
    // Register user
    register: async (userData) => {
        const response = await axios.post(API_URL + 'signup', userData);

        if (response.data) {
            // Save user data (including token) to local storage
            persistAuthUser(response.data);
        }

        return response.data;
    },

    // Login user
    login: async (userData) => {
        const response = await axios.post(API_URL + 'login', userData);

        if (response.data) {
            // Save user data (including token) to local storage
            persistAuthUser(response.data);
        }

        return response.data;
    },

    // Logout user
    logout: async () => {
        try {
            await axios.post(API_URL + 'logout');
        } catch (_error) {
            // ignore transport errors during client-side logout cleanup
        }
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('syz_onboarding_complete');
        setAuthHeader(null);
    },
};

// --- ASYNC THUNKS (The Redux Actions) ---

// Register Thunk
export const register = createAsyncThunk(
    'auth/register', // Action name
    async (user, thunkAPI) => {
        try {
            return await authService.register(user);
        } catch (error) {
            // Error handling: get the message from response, or generic error
            const message = 
                (error.response && error.response.data && error.response.data.message) ||
                error.message ||
                error.toString();
            
            // Rejects the promise and returns the error message
            return thunkAPI.rejectWithValue(message);
        }
    }
);

// Login Thunk
export const login = createAsyncThunk(
    'auth/login', // Action name
    async (user, thunkAPI) => {
        try {
            return await authService.login(user);
        } catch (error) {
            const message = 
                (error.response && error.response.data && error.response.data.message) ||
                error.message ||
                error.toString();
            
            return thunkAPI.rejectWithValue(message);
        }
    }
);

// Logout Thunk
export const logout = createAsyncThunk('auth/logout', async () => {
    await authService.logout();
});


// --- AUTH SLICE ---
export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        // Reducer to reset all status flags after a success/error notification
        reset: (state) => {
            state.isLoading = false;
            state.isSuccess = false;
            state.isError = false;
            state.message = '';
        },
    },
    extraReducers: (builder) => {
        builder
            // --- REGISTER ---
            .addCase(register.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(register.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                persistAuthUser(action.payload);
            })
            .addCase(register.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload; // Payload is the error message from rejectWithValue
                state.user = null; // Registration failed, ensure user is null
                setAuthHeader(null);
            })
            // --- LOGIN ---
            .addCase(login.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(login.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                persistAuthUser(action.payload);
            })
            .addCase(login.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload;
                state.user = null; // Login failed, ensure user is null
                setAuthHeader(null);
            })
            // --- LOGOUT ---
            .addCase(logout.fulfilled, (state) => {
                state.user = null;
                setAuthHeader(null);
            });
    },
});

// Export the reset action and the slice reducer
export const { reset } = authSlice.actions;
export default authSlice.reducer;
