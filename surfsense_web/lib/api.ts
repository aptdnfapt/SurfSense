import { toast } from "sonner";
import { getConfig } from './config';

/**
 * Custom fetch wrapper that handles authentication and redirects to home page on 401 Unauthorized
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns The fetch response
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
	// Only run on client-side
	if (typeof window === "undefined") {
		return fetch(url, options);
	}

	// Get token from localStorage
	const token = localStorage.getItem("surfsense_bearer_token");

	// Add authorization header if token exists
	const headers = {
		...options.headers,
		...(token && { Authorization: `Bearer ${token}` }),
	};

	// Make the request
	const response = await fetch(url, {
		...options,
		headers,
	});

	// Handle 401 Unauthorized response
	if (response.status === 401) {
		// Show error toast
		toast.error("Session expired. Please log in again.");

		// Clear token
		localStorage.removeItem("surfsense_bearer_token");

		// Redirect to home page
		window.location.href = "/";

		// Throw error to stop further processing
		throw new Error("Unauthorized: Redirecting to login page");
	}

	return response;
}

function getBackendUrl(): string {
  // Try cached config first
  const config = getConfig();
  if (config) {
    return config.backendUrl;
  }
  
  // No cached config - throw proper error instead of silent fallback
  if (typeof window !== 'undefined') {
    throw new Error('Backend configuration not available. Please ensure fetchConfig() was called before using API calls.');
  }
  
  // Only for server-side rendering (build time), use env variable
  const baseUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL;
  if (!baseUrl) {
    throw new Error('Backend URL not configured. Set NEXT_PUBLIC_FASTAPI_BACKEND_URL environment variable.');
  }
  return baseUrl;
}

/**
 * Get the full API URL
 *
 * @param path - The API path
 * @returns The full API URL
 */
export function getApiUrl(path: string): string {
	// Remove leading slash if present
	const cleanPath = path.startsWith("/") ? path.slice(1) : path;

	const baseUrl = getBackendUrl();

	// Combine base URL and path
	return `${baseUrl}/${cleanPath}`;
}

/**
 * API client with methods for common operations
 */
export const apiClient = {
	/**
	 * Make a GET request
	 *
	 * @param path - The API path
	 * @param options - Additional fetch options
	 * @returns The response data
	 */
	async get<T>(path: string, options: RequestInit = {}): Promise<T> {
		const response = await fetchWithAuth(getApiUrl(path), {
			method: "GET",
			...options,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => null);
			throw new Error(`API error: ${response.status} ${errorData?.detail || response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Make a POST request
	 *
	 * @param path - The API path
	 * @param data - The request body
	 * @param options - Additional fetch options
	 * @returns The response data
	 */
	async post<T>(path: string, data: any, options: RequestInit = {}): Promise<T> {
		const response = await fetchWithAuth(getApiUrl(path), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			body: JSON.stringify(data),
			...options,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => null);
			throw new Error(`API error: ${response.status} ${errorData?.detail || response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Make a PUT request
	 *
	 * @param path - The API path
	 * @param data - The request body
	 * @param options - Additional fetch options
	 * @returns The response data
	 */
	async put<T>(path: string, data: any, options: RequestInit = {}): Promise<T> {
		const response = await fetchWithAuth(getApiUrl(path), {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			body: JSON.stringify(data),
			...options,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => null);
			throw new Error(`API error: ${response.status} ${errorData?.detail || response.statusText}`);
		}

		return response.json();
	},

	/**
	 * Make a DELETE request
	 *
	 * @param path - The API path
	 * @param options - Additional fetch options
	 * @returns The response data
	 */
	async delete<T>(path: string, options: RequestInit = {}): Promise<T> {
		const response = await fetchWithAuth(getApiUrl(path), {
			method: "DELETE",
			...options,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => null);
			throw new Error(`API error: ${response.status} ${errorData?.detail || response.statusText}`);
		}

		return response.json();
	},
};
