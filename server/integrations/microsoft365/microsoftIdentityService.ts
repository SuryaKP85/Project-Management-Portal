import { config } from '../../config/env';
import { User, SafeUser } from '../../models/types';
import { UserRepository } from '../../repositories/userRepository';

export interface MicrosoftOAuthTokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  idToken?: string;
}

export interface MicrosoftUserProfile {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
}

/**
 * Microsoft 365 & Entra ID Integration Service Abstraction
 * Manages OAuth2 authorization code flows and Microsoft Graph API delegation server-side.
 */
export const MicrosoftIdentityService = {
  isConfigured(): boolean {
    return Boolean(config.microsoft.clientId && config.microsoft.clientSecret);
  },

  getAuthorizationUrl(state?: string): string {
    if (!this.isConfigured()) {
      throw new Error('Microsoft 365 Integration is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.');
    }
    const params = new URLSearchParams({
      client_id: config.microsoft.clientId,
      response_type: 'code',
      redirect_uri: config.microsoft.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email User.Read Calendars.ReadWrite Mail.Send Team.ReadBasic.All offline_access',
      state: state || 'surya_pm_ms_oauth',
    });
    return `https://login.microsoftonline.com/${config.microsoft.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async associateMicrosoftIdentity(appUserId: string, msProfile: MicrosoftUserProfile, tenantId: string): Promise<SafeUser | null> {
    return UserRepository.update(appUserId, {
      msUserId: msProfile.id,
      msTenantId: tenantId,
      title: msProfile.jobTitle,
      department: msProfile.department,
    });
  },

  // Stub for Microsoft Graph API queries (e.g. Outlook Calendar, Teams, Mail)
  async getGraphClientForUser(_userId: string) {
    if (!this.isConfigured()) {
      return null;
    }
    // Future Sprint: Initialize Microsoft Graph SDK client using server-cached refresh tokens
    return {
      async listCalendarEvents() {
        return [];
      },
      async sendMail(_subject: string, _body: string, _toRecipients: string[]) {
        return { success: true };
      },
    };
  },
};
