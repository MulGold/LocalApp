import { useState, useContext, useMemo, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { AnimatePresence, motion } from 'motion/react';
import { CustomSelect } from '../components/CustomSelect';
import { 
  Plus, 
  Search, 
  X, 
  User, 
  Shield, 
  Mail, 
  Key, 
  RefreshCw, 
  Activity, 
  Calendar, 
  Clock, 
  ShoppingBag, 
  CheckCircle2, 
  AlertTriangle, 
  Slash, 
  MoreVertical,
  Filter,
  UserCheck,
  UserX,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';

// Full Name format validator: letters, spaces, hyphens, and apostrophes; no numbers; not entirely symbols
const validateFullName = (name: unknown): { isValid: boolean; error?: string } => {
  if (typeof name !== 'string') {
    return { isValid: false, error: 'Full Name is required.' };
  }
  const cleanName = name.trim();
  if (!cleanName) {
    return { isValid: false, error: 'Full Name is required.' };
  }
  if (cleanName.length > 50) {
    return { isValid: false, error: 'Full Name cannot exceed 50 characters.' };
  }
  if (/[0-9]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name must not contain numbers.' };
  }
  if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name cannot be made entirely of symbols.' };
  }
  if (!/^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s'-]+$/.test(cleanName)) {
    return { isValid: false, error: 'Full Name can only contain letters, spaces, hyphens, and apostrophes.' };
  }
  return { isValid: true };
};

// Email format validator: rejects invalid formats such as "1@1"
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/i;
  return emailRegex.test(email.trim());
};

export const AccountManagement = () => {
  const { 
    accounts = [], 
    loadingUsers, 
    fetchUsers, 
    addAccount, 
    updateUserStatus, 
    updateUserRole, 
    user: currentUser 
  } = useContext(AuthContext) as any;

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'staff' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Suspended'>('all');
  
  // Modals
  const [isAdding, setIsAdding] = useState(false);
  const [selectedUserActivity, setSelectedUserActivity] = useState<any | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff',
    status: 'Active'
  });

  const [formError, setFormError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 4000);
  };

  useEffect(() => {
    if (fetchUsers) {
      fetchUsers();
    }
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanName = formData.name.trim();
    const cleanPassword = formData.password.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      setFormError('All fields are required.');
      return;
    }

    // 1. Full Name: Reject names containing numbers or consisting entirely of symbols
    const nameCheck = validateFullName(cleanName);
    if (!nameCheck.isValid) {
      setFormError(nameCheck.error || 'Full Name is invalid.');
      return;
    }

    // 2. Email: Reject invalid email addresses such as "1@1"
    if (!isValidEmail(cleanEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    // 3. Password: Reject passwords that do not meet the existing minimum length requirement
    if (cleanPassword.length < 8) {
      setFormError('Password must be at least 8 characters in length.');
      return;
    }

    const exists = accounts.find((a: any) => a.email && a.email.toLowerCase() === cleanEmail);
    if (exists) {
      setFormError('An account with this email address already exists.');
      return;
    }

    try {
      await addAccount({
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: formData.role,
        status: formData.status
      });
      setIsAdding(false);
      resetForm();
      showToast(`Account for ${cleanName} created successfully.`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create account.');
    }
  };

  const handleStatusChange = async (userId: string, newStatus: 'Active' | 'Suspended', userName: string) => {
    setActionMenuOpenId(null);
    try {
      await updateUserStatus(userId, newStatus);
      showToast(`Account status for ${userName} changed to ${newStatus}. All historical order records remain intact.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update status.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'customer' | 'staff' | 'admin', userName: string) => {
    setActionMenuOpenId(null);
    try {
      await updateUserRole(userId, newRole);
      showToast(`Role for ${userName} updated to ${newRole.toUpperCase()}.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update role.');
    }
  };

  const resetForm = () => {
    setFormError('');
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'staff',
      status: 'Active'
    });
  };

  const formatDate = (dateStr?: string | Date) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return String(dateStr);
    }
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc: any) => {
      const nameMatch = acc.name?.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const emailMatch = acc.email?.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchesSearch = searchTerm.trim() === '' || nameMatch || emailMatch;

      const accRole = (acc.role || 'customer').toLowerCase();
      const matchesRole = roleFilter === 'all' || accRole === roleFilter.toLowerCase();

      const accStatus = acc.status || 'Active';
      const matchesStatus = statusFilter === 'all' || accStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [accounts, searchTerm, roleFilter, statusFilter]);

  // Metric stats
  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a: any) => (a.status || 'Active') === 'Active').length;
    const suspended = accounts.filter((a: any) => a.status === 'Suspended').length;
    const customers = accounts.filter((a: any) => (a.role || 'customer') === 'customer').length;

    return { total, active, suspended, customers };
  }, [accounts]);

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Success Toast */}
        <AnimatePresence>
          {successToast && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-5 right-5 z-50 bg-dark text-white px-4 py-3 rounded-lg shadow-xl border border-gray-700 flex items-center gap-3 text-xs font-bold"
            >
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>{successToast}</span>
              <button onClick={() => setSuccessToast('')} className="ml-2 text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Header Actions */}
        <div className="flex justify-end items-center gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button 
              onClick={() => fetchUsers && fetchUsers()} 
              disabled={loadingUsers}
              className="bg-white border border-gray-300 text-gray-700 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
              title="Refresh User Data"
            >
              <RefreshCw size={15} className={loadingUsers ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button 
              onClick={() => { setIsAdding(true); resetForm(); }}
              className="flex-1 md:flex-none bg-dark text-white px-4 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-primary transition-colors active:translate-y-0.5 shadow-sm"
            >
              <Plus size={16} />
              <span>Create Account</span>
            </button>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Total Registered</div>
            <div className="text-xl font-black text-dark mt-1">{stats.total}</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider">Active Status</div>
            <div className="text-xl font-black text-emerald-600 mt-1">{stats.active}</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">Suspended</div>
            <div className="text-xl font-black text-amber-600 mt-1">{stats.suspended}</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-blue-700 text-[10px] font-bold uppercase tracking-wider">Customers</div>
            <div className="text-xl font-black text-blue-600 mt-1">{stats.customers}</div>
          </div>
        </div>

        {/* Search and Filters Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4 justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email address..."
              className="w-full pl-10 pr-9 py-2 rounded-lg bg-gray-50 border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark placeholder:text-gray-400"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <CustomSelect 
              labelPrefix="Role:"
              value={roleFilter}
              onChange={(val: any) => setRoleFilter(val)}
              options={[
                { value: 'all', label: 'All Roles' },
                { value: 'customer', label: 'Customer' },
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Administrator' }
              ]}
              triggerClassName="bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-dark hover:border-dark focus:outline-none cursor-pointer"
            />

            {/* Status Filter */}
            <CustomSelect 
              labelPrefix="Status:"
              value={statusFilter}
              onChange={(val: any) => setStatusFilter(val)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'Active', label: 'Active' },
                { value: 'Suspended', label: 'Suspended' }
              ]}
              triggerClassName="bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-dark hover:border-dark focus:outline-none cursor-pointer"
            />

            {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
              <button 
                onClick={() => { setSearchTerm(''); setRoleFilter('all'); setStatusFilter('all'); }}
                className="text-[11px] font-bold text-gray-500 hover:text-dark underline px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Audit Preservation Notice */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={18} className="text-amber-600 shrink-0" />
            <span>
              <strong>Record Retention Policy:</strong> Accounts cannot be permanently erased to guarantee customer transaction histories and payment receipts remain fully auditable. Deactivate accounts using <strong>Suspend</strong>.
            </span>
          </div>
        </div>

        {/* User Accounts Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-xs font-black text-dark uppercase tracking-wider">
              Registered Accounts List ({filteredAccounts.length})
            </h2>
            <span className="text-[11px] text-gray-500 font-medium">
              Passwords securely hashed & hidden
            </span>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <User className="mx-auto text-gray-300 mb-3" size={40} />
              <p className="text-sm font-bold text-dark">No matching accounts found</p>
              <p className="text-xs text-gray-500 mt-1">Try adjusting your search query or status filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Account Details</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Orders</th>
                    <th className="py-3.5 px-4">Date Registered</th>
                    <th className="py-3.5 px-4">Last Login</th>
                    <th className="py-3.5 px-4 text-center">Activity History</th>
                    <th className="py-3.5 px-4 text-right">Status Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredAccounts.map((acc: any) => {
                    const accStatus = acc.status || 'Active';
                    const isCurrent = currentUser?.email?.toLowerCase() === acc.email?.toLowerCase();

                    return (
                      <tr key={acc.id || acc._id || acc.email} className="hover:bg-gray-50/80 transition-colors">
                        {/* Account Details: Name & Email */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0 ${
                              acc.role === 'admin' ? 'bg-dark' : acc.role === 'staff' ? 'bg-purple-600' : 'bg-primary'
                            }`}>
                              {acc.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-dark truncate">{acc.name}</span>
                                {isCurrent && (
                                  <span className="text-[9px] bg-dark text-white px-1.5 py-0.2 rounded uppercase font-bold tracking-wider">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-gray-500 text-[11px] font-medium truncate">
                                <Mail size={12} className="shrink-0 text-gray-400" />
                                <span>{acc.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            acc.role === 'admin' 
                              ? 'bg-dark text-white border-dark' 
                              : acc.role === 'staff' 
                              ? 'bg-purple-50 text-purple-700 border-purple-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {acc.role || 'customer'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            accStatus === 'Suspended'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              accStatus === 'Suspended' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />
                            {accStatus === 'Suspended' ? 'Suspended' : 'Active'}
                          </span>
                        </td>

                        {/* Number of Orders */}
                        <td className="py-3.5 px-4 font-semibold text-dark">
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag size={14} className="text-gray-400" />
                            <span>{acc.orderCount || 0}</span>
                          </div>
                        </td>

                        {/* Date Registered */}
                        <td className="py-3.5 px-4 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-gray-400 shrink-0" />
                            <span>{formatDate(acc.createdAt)}</span>
                          </div>
                        </td>

                        {/* Last Login */}
                        <td className="py-3.5 px-4 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-gray-400 shrink-0" />
                            <span>{formatDate(acc.lastLogin)}</span>
                          </div>
                        </td>

                        {/* Recent Login History / Activity */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setSelectedUserActivity(acc)}
                            className="inline-flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
                            title="Inspect Login & Security History"
                          >
                            <Activity size={13} className="text-primary" />
                            <span>{acc.loginHistory?.length || 1} Logs</span>
                          </button>
                        </td>

                        {/* Action Status Menu */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {accStatus === 'Suspended' && (
                              <button
                                onClick={() => handleStatusChange(acc.id || acc._id, 'Active', acc.name)}
                                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                                title="Set Account Active"
                              >
                                <UserCheck size={12} /> Activate
                              </button>
                            )}

                            {accStatus !== 'Suspended' && (
                              <button
                                onClick={() => handleStatusChange(acc.id || acc._id, 'Suspended', acc.name)}
                                disabled={isCurrent}
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 border ${
                                  isCurrent 
                                    ? 'text-gray-300 border-gray-200 cursor-not-allowed' 
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200'
                                }`}
                                title="Suspend Account"
                              >
                                <AlertTriangle size={12} /> Suspend
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity & Login History Modal */}
        <AnimatePresence>
          {selectedUserActivity && (
            <div 
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedUserActivity(null)}
            >
              <div 
                className="bg-white rounded-xl border border-gray-200 max-w-lg w-full overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Activity size={18} className="text-primary" />
                    <div>
                      <h3 className="text-sm font-black text-dark uppercase tracking-wide">
                        Account Activity & Login History
                      </h3>
                      <p className="text-[11px] text-gray-500 font-medium">{selectedUserActivity.name} ({selectedUserActivity.email})</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedUserActivity(null)} 
                    className="text-gray-400 hover:text-dark p-1 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
                  <div className="grid grid-cols-2 gap-3 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[10px] font-bold uppercase">Account Status</span>
                      <span className="font-bold text-dark">{selectedUserActivity.status || 'Active'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] font-bold uppercase">Total Orders</span>
                      <span className="font-bold text-dark">{selectedUserActivity.orderCount || 0} Orders</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] font-bold uppercase">Registered</span>
                      <span className="font-medium text-dark">{formatDate(selectedUserActivity.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] font-bold uppercase">Last Login</span>
                      <span className="font-medium text-dark">{formatDate(selectedUserActivity.lastLogin)}</span>
                    </div>
                  </div>

                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Recent Security Events</h4>

                  {selectedUserActivity.loginHistory && selectedUserActivity.loginHistory.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUserActivity.loginHistory.map((log: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white rounded-lg border border-gray-200 text-xs flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="font-bold text-dark flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              {log.action || 'Login Session'}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-3">
                              <span>IP: {log.ip || '127.0.0.1'}</span>
                              <span>Agent: {log.userAgent ? log.userAgent.substring(0, 30) : 'Browser'}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                            {formatDate(log.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center bg-gray-50 rounded-lg text-xs text-gray-500">
                      Standard registration activity recorded on {formatDate(selectedUserActivity.createdAt)}.
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex justify-end">
                  <button 
                    onClick={() => setSelectedUserActivity(null)}
                    className="bg-dark text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-primary transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Staff / Admin Account Modal */}
        <AnimatePresence>
          {isAdding && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h2 className="text-sm font-black text-dark uppercase tracking-wider flex items-center gap-2">
                    <Plus size={16} /> Create Staff / Admin Account
                  </h2>
                  <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-dark">
                    <X size={18} />
                  </button>
                </div>
                
                <form onSubmit={handleCreateAccount} className="p-5 space-y-4">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg">
                      {formError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                        placeholder="Juan Dela Cruz"
                        maxLength={50}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input 
                        type="email" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                        placeholder="name@gmail.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Initial Password *</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input 
                        type="password" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Account Role</label>
                      <CustomSelect 
                        value={formData.role}
                        onChange={(val) => setFormData({...formData, role: val})}
                        options={[
                          { value: 'staff', label: 'Staff Member' },
                          { value: 'admin', label: 'Administrator' },
                          { value: 'customer', label: 'Customer' }
                        ]}
                        className="w-full"
                        triggerClassName="w-full p-2 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Initial Status</label>
                      <CustomSelect 
                        value={formData.status}
                        onChange={(val) => setFormData({...formData, status: val})}
                        options={[
                          { value: 'Active', label: 'Active' },
                          { value: 'Suspended', label: 'Suspended' }
                        ]}
                        className="w-full"
                        triggerClassName="w-full p-2 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 border-t border-gray-200 -mx-5 -mb-5 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-dark text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-primary transition-colors active:translate-y-0.5"
                    >
                      Save Account
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default AccountManagement;
