import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, User as FirebaseUser } from 'firebase/auth';

export const securityService = {
  async changePassword(user: FirebaseUser, oldPassword: string, newPassword: string): Promise<void> {
    if (user.uid.startsWith('mock-')) {
      console.log('Simulating password change for mock user to:', newPassword);
      return;
    }

    try {
      // Firebase requires reauthentication for sensitive operations like updating password
      if (user.email) {
        const credential = EmailAuthProvider.credential(user.email, oldPassword);
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, newPassword);
    } catch (error: any) {
      console.error('Error changing password:', error);
      
      const code = error?.code;
      if (code === 'auth/wrong-password') {
        throw new Error('A senha atual inserida está incorreta.');
      } else if (code === 'auth/weak-password') {
        throw new Error('A nova senha é muito fraca. Escolha uma senha com pelo menos 8 caracteres.');
      } else if (code === 'auth/requires-recent-login') {
        throw new Error('Sua sessão expirou. Por segurança, saia da conta e entre novamente para alterar sua senha.');
      } else {
        throw new Error(error.message || 'Não foi possível alterar a senha. Tente novamente.');
      }
    }
  }
};
