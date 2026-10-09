/**
 * Centralized Enterprise API Client for Surya PM Portal V2.0
 * Handles common headers, authentication tokens, timeout handling, and consistent error normalization.
 */
export class ApiClient {
  constructor(baseUrl = '/api/v1', timeoutMs = 15000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    // Sprint 25: the session is the HttpOnly cookie only. JavaScript never holds the
    // token, so a token stored by an earlier version is removed.
    try {
      sessionStorage.removeItem('pm_v2_auth_token');
    } catch {
      /* storage unavailable */
    }
  }

  /** Kept for callers of earlier versions; the token is never stored or sent by JavaScript. */
  setAuthToken(_token) {
    try {
      sessionStorage.removeItem('pm_v2_auth_token');
    } catch {
      /* storage unavailable */
    }
  }

  getAuthToken() {
    return null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        credentials: 'include', // Ensures HTTP-only cookie is sent
      });

      clearTimeout(timeoutId);

      let responseData = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const text = await response.text();
        responseData = { success: response.ok, data: text };
      }

      if (!response.ok) {
        const errorMsg = (responseData && responseData.error && responseData.error.message)
          || responseData.message
          || `HTTP Error ${response.status}: ${response.statusText}`;
        const errorCode = (responseData && responseData.error && responseData.error.code) || 'API_ERROR';
        
        const error = new Error(errorMsg);
        error.code = errorCode;
        error.status = response.status;
        error.details = responseData && responseData.error ? responseData.error.details : null;
        throw error;
      }

      return responseData.data !== undefined ? responseData.data : responseData;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Request timed out after ${this.timeoutMs}ms`);
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
