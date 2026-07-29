/* emailGenerator.js - Automated email credential generator for enterprise onboarding */

export const EmailGeneratorModule = {
  /**
   * Generates mailto URI for sending login credentials to a new or existing user
   * @param {object} user - User object containing name, email, and temporary password
   */
  generateCredentialEmailUri(user, tempPassword = 'iRely@123') {
    if (!user || !user.email) return '';

    const employeeName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Employee';
    const email = user.email;

    const subject = 'Welcome to Project Management Portal';
    const body = `Hello ${employeeName},\n\nYour account has been created.\n\nUsername: ${email}\nTemporary Password: ${tempPassword}\n\nPlease login and change your password immediately.\n\nRegards,\nProject Management Office`;

    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },

  /**
   * Triggers the mailto action in the client browser
   */
  sendCredentials(user, tempPassword = 'iRely@123') {
    const uri = this.generateCredentialEmailUri(user, tempPassword);
    if (!uri) return false;
    window.location.href = uri;
    return true;
  }
};
