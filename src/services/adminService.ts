import { auth } from '../lib/firebase';

const getAuthHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || ''}`
  };
};

export const adminService = {
  // 1. Fetch all merchant users
  async getMerchants(): Promise<any[]> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/merchants', {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar usuários merchants.');
    }
    return res.json();
  },

  // 1.1 Search users by name or email
  async searchUsers(q: string): Promise<any[]> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar usuários.');
    }
    return res.json();
  },

  // 1.2 Link owner (Create new or link existing)
  async linkOwner(establishmentId: string, data: { name?: string; email: string; phone?: string; uid?: string; allowCustomerConversion?: boolean }): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${establishmentId}/link-owner`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Falha ao vincular proprietário.');
    }
    return result;
  },

  // 1.3 Replace owner
  async replaceOwner(establishmentId: string, data: { name?: string; email: string; phone?: string; uid?: string; allowCustomerConversion?: boolean }): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${establishmentId}/replace-owner`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Falha ao substituir proprietário.');
    }
    return result;
  },

  // 1.4 Unlink owner
  async unlinkOwner(establishmentId: string): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${establishmentId}/unlink-owner`, {
      method: 'POST',
      headers
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Falha ao desvincular proprietário.');
    }
    return result;
  },

  // 1.5 Resend invite link
  async resendInvite(establishmentId: string): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${establishmentId}/resend-invite`, {
      method: 'POST',
      headers
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Falha ao reenviar convite.');
    }
    return result;
  },

  // 1.5.1 Create owner access with password (direct creation on backend)
  async createOwnerAccess(establishmentId: string, data: { name: string; email: string; phone?: string; password: string }): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${establishmentId}/create-owner-access`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(result.error || 'Falha ao criar acesso do proprietário.');
      (err as any).code = result.code;
      throw err;
    }
    return result;
  },

  // 2. Link a merchant user to an establishment
  async linkMerchant(uid: string, establishmentId: string | null): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${uid}/link-establishment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ establishmentId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao vincular merchant.');
    }
  },

  // 3. Create a new establishment
  async createEstablishment(data: any): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/establishments/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar estabelecimento.');
    }
    return res.json();
  },

  // 4. Update establishment general data
  async updateEstablishment(id: string, data: any): Promise<any> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${id}/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar dados gerais do estabelecimento.');
    }
    return res.json();
  },

  // 5. Update establishment lifecycle status
  async updateEstablishmentStatus(id: string, status: 'active' | 'paused' | 'inactive' | 'archived', reason?: string): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/establishments/${id}/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status, reason })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar status do estabelecimento.');
    }
  }
};
