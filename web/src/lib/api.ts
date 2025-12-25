import axios from 'axios';

// Create an axios instance with default config
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1', // Fallback to local default
    withCredentials: true, // Important for session cookies
    headers: {
        'Content-Type': 'application/json',
    },
});

// Response interceptor to handle auth errors globally
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Handle unauthorized access (e.g., redirect to login if not already there)
            // We'll let the store/components handle redirects for now mostly
        }
        return Promise.reject(error);
    }
);
